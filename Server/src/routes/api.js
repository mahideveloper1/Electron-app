const express = require('express');
const { body, param, query, validationResult } = require('express-validator');
const { authenticateKey, requirePermission } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const AlertService = require('../services/AlterService');

const router = express.Router();

module.exports = (models) => {
  const { Machine, SystemReport, Alert } = models;
  const alertService = new AlertService(models);

  // Apply authentication to all routes
  router.use(authenticateKey(models));

  const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation failed',
        details: formatValidationErrors(errors)
      });
    }
    next();
  };

  // POST /api/machines
  router.post('/machines',
    requirePermission('write'),
    [
      body('machineId').notEmpty().withMessage('Machine ID is required'),
      body('platform').notEmpty().withMessage('Platform is required'),
      body('hostname').notEmpty().withMessage('Hostname is required'),
      body('timestamp').isISO8601().withMessage('Valid timestamp is required'),
      body('osInfo').isObject().withMessage('OS info is required'),
      body('diskEncryption').exists().withMessage('Disk encryption status is required'),
      body('osUpdates').exists().withMessage('OS updates status is required'),
      body('antivirus').exists().withMessage('Antivirus status is required'),
      body('sleepSettings').exists().withMessage('Sleep settings are required')
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const systemData = req.body;

      // Upsert Machine
      await Machine.findOneAndUpdate(
        { machineId: systemData.machineId },
        { 
          machineId: systemData.machineId,
          hostname: systemData.hostname,
          platform: systemData.platform,
          lastSeen: systemData.timestamp,
          osInfo: systemData.osInfo,
          isActive: true
        },
        { upsert: true, new: true }
      );

      // Create System Report
      const report = await SystemReport.create({
        machineId: systemData.machineId,
        timestamp: systemData.timestamp,
        diskEncryption: systemData.diskEncryption,
        osUpdates: systemData.osUpdates,
        antivirus: systemData.antivirus,
        sleepSettings: systemData.sleepSettings,
        loadAverage: systemData.loadAverage || []
      });

      // Analyze and create alerts
      await alertService.analyzeSystemData(systemData);

      res.status(201).json({
        success: true,
        message: 'System data received successfully',
        reportId: report._id,
        timestamp: new Date().toISOString()
      });
    })
  );

  // GET /api/machines
  router.get('/machines',
    requirePermission('read'),
    [
      query('limit').optional().isInt({ min: 1, max: 500 }).withMessage('Limit must be between 1 and 500'),
      query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const machines = await Machine.find().skip(offset).limit(limit).lean();
      const machinesWithReports = await Promise.all(
        machines.map(async (m) => {
          const latestReport = await SystemReport.findOne({ machineId: m.machineId }).sort({ timestamp: -1 }).lean();
          return {
            ...m,
            latestReport: latestReport || null
          };
        })
      );

      res.json({
        success: true,
        data: machinesWithReports,
        pagination: { limit, offset, total: machinesWithReports.length }
      });
    })
  );

  // GET /api/machines/:machineId
  router.get('/machines/:machineId',
    requirePermission('read'),
    [ param('machineId').notEmpty().withMessage('Machine ID is required') ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { machineId } = req.params;
      const machine = await Machine.findOne({ machineId }).lean();
      if (!machine) return res.status(404).json({ error: 'Machine not found' });

      const latestReport = await SystemReport.findOne({ machineId }).sort({ timestamp: -1 }).lean();
      const alerts = await Alert.find({ machineId }).sort({ createdAt: -1 }).limit(10).lean();

      res.json({
        success: true,
        data: { ...machine, latestReport, recentAlerts: alerts }
      });
    })
  );

  // GET /api/machines/:machineId/reports
  router.get('/machines/:machineId/reports',
    requirePermission('read'),
    [
      param('machineId').notEmpty().withMessage('Machine ID is required'),
      query('limit').optional().isInt({ min: 1, max: 200 }).withMessage('Limit must be between 1 and 200'),
      query('offset').optional().isInt({ min: 0 }).withMessage('Offset must be non-negative')
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { machineId } = req.params;
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;

      const reports = await SystemReport.find({ machineId }).skip(offset).limit(limit).sort({ timestamp: -1 }).lean();
      res.json({ success: true, data: reports, pagination: { limit, offset, total: reports.length } });
    })
  );

  // GET /api/reports
  router.get('/reports',
    requirePermission('read'),
    [
      query('limit').optional().isInt({ min: 1, max: 200 }),
      query('offset').optional().isInt({ min: 0 })
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const limit = parseInt(req.query.limit) || 50;
      const offset = parseInt(req.query.offset) || 0;
      const reports = await SystemReport.find().skip(offset).limit(limit).sort({ timestamp: -1 }).lean();
      res.json({ success: true, data: reports, pagination: { limit, offset, total: reports.length } });
    })
  );

  // GET /api/alerts
  router.get('/alerts',
    requirePermission('read'),
    [
      query('machineId').optional().notEmpty(),
      query('resolved').optional().isBoolean(),
      query('limit').optional().isInt({ min: 1, max: 500 })
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { machineId, resolved } = req.query;
      const limit = parseInt(req.query.limit) || 100;

      const query = {};
      if (machineId) query.machineId = machineId;
      if (resolved !== undefined) query.isResolved = resolved === 'true';

      const alerts = await Alert.find(query).limit(limit).sort({ createdAt: -1 }).lean();
      res.json({ success: true, data: alerts, filters: { machineId: machineId || null, resolved, limit } });
    })
  );

  // POST /api/alerts/:alertId/resolve
  router.post('/alerts/:alertId/resolve',
    requirePermission('write'),
    [ param('alertId').notEmpty() ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { alertId } = req.params;
      const updated = await Alert.findByIdAndUpdate(alertId, { isResolved: true }, { new: true });
      if (!updated) return res.status(404).json({ error: 'Alert not found' });
      res.json({ success: true, message: 'Alert resolved successfully' });
    })
  );

  // GET /api/stats
  router.get('/stats', requirePermission('read'), asyncHandler(async (req, res) => {
    const totalMachines = await Machine.countDocuments();
    const totalReports = await SystemReport.countDocuments();
    const totalAlerts = await Alert.countDocuments({ isResolved: false });

    res.json({
      success: true,
      data: { totalMachines, totalReports, totalAlerts, timestamp: new Date().toISOString() }
    });
  }));

  // GET /api/health
  router.get('/health', (req, res) => {
    res.json({ success: true, status: 'healthy', timestamp: new Date().toISOString(), version: '1.0.0' });
  });

  return router;
};
