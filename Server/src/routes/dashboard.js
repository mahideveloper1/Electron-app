const express = require('express');
const { query, validationResult } = require('express-validator');
const { verifyToken } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');

const router = express.Router();

module.exports = (models) => {
  const { Machine, SystemReport, Alert } = models;

  router.use(verifyToken);

  const handleValidation = (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Validation failed', details: formatValidationErrors(errors) });
    }
    next();
  };

  // GET /dashboard/overview
  router.get('/overview', asyncHandler(async (req, res) => {
    const totalMachines = await Machine.countDocuments();
    const totalAlerts = await Alert.countDocuments({ isResolved: false });
    const totalReports = await SystemReport.countDocuments();

    const recentAlerts = await Alert.find().sort({ createdAt: -1 }).limit(5).lean();
    const staleMachines = await Machine.find({
      lastSeen: { $lt: new Date(Date.now() - 60 * 60 * 1000) },
      isActive: true
    }).lean();

    const healthReports = await SystemReport.aggregate([
      { $match: { timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } } },
      { $group: { 
          _id: '$machineId',
          latest: { $last: '$$ROOT' }
        } 
      }
    ]);

    let healthStats = { encrypted:0, unencrypted:0, upToDate:0, outdated:0, antivirusActive:0, antivirusInactive:0, sleepCompliant:0, sleepNonCompliant:0 };

    healthReports.forEach(r => {
      const report = r.latest;
      if (report.diskEncryption?.encrypted) healthStats.encrypted++; else healthStats.unencrypted++;
      if (report.osUpdates?.upToDate) healthStats.upToDate++; else healthStats.outdated++;
      if (report.antivirus?.installed && report.antivirus?.enabled) healthStats.antivirusActive++; else healthStats.antivirusInactive++;
      if (report.sleepSettings?.sleepTimeout <= 10) healthStats.sleepCompliant++; else healthStats.sleepNonCompliant++;
    });

    res.json({
      success: true,
      data: {
        stats: { totalMachines, totalReports, totalAlerts },
        recentAlerts,
        staleMachines: staleMachines.length,
        healthStats,
        timestamp: new Date()
      }
    });
  }));

  // GET /dashboard/machines
  router.get('/machines',
    [
      query('status').optional().isIn(['all', 'active', 'inactive', 'stale']),
      query('limit').optional().isInt({ min: 1, max: 100 })
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { status = 'all' } = req.query;
      const limit = parseInt(req.query.limit) || 50;

      let filter = {};
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      if (status === 'active') filter.lastSeen = { $gt: oneHourAgo };
      else if (status === 'inactive') filter.isActive = false;
      else if (status === 'stale') filter.lastSeen = { $lt: oneHourAgo }, filter.isActive = true;

      const machines = await Machine.find(filter).sort({ lastSeen: -1 }).limit(limit).lean();

      const enrichedMachines = await Promise.all(machines.map(async (m) => {
        const latestReport = await SystemReport.findOne({ machineId: m.machineId }).sort({ timestamp: -1 }).lean();
        const alertCount = await Alert.countDocuments({ machineId: m.machineId, isResolved: false });

        let healthStatus = 'unknown', issues = [];
        if (latestReport) {
          if (!latestReport.diskEncryption?.encrypted) issues.push('Disk not encrypted');
          if (!latestReport.osUpdates?.upToDate) issues.push('OS updates pending');
          if (!latestReport.antivirus?.installed || !latestReport.antivirus?.enabled) issues.push('Antivirus inactive');
          if (latestReport.sleepSettings?.sleepTimeout > 10) issues.push('Sleep timeout too long');

          healthStatus = issues.length === 0 ? 'healthy' : issues.length <= 2 ? 'warning' : 'critical';
        }

        return { ...m, healthStatus, issues, alertCount, lastReportTime: latestReport?.timestamp || null, isOnline: m.lastSeen > oneHourAgo };
      }));

      res.json({ success: true, data: enrichedMachines, filters: { status, limit, total: enrichedMachines.length } });
    })
  );

  // GET /dashboard/alerts
  router.get('/alerts',
    [
      query('severity').optional().isIn(['low','medium','high','critical']),
      query('timeframe').optional().isIn(['1h','24h','7d','30d']),
      query('resolved').optional().isBoolean()
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { severity, timeframe='24h', resolved=false } = req.query;
      const now = new Date();
      let timeFilter = new Date();

      if (timeframe==='1h') timeFilter.setHours(now.getHours()-1);
      else if (timeframe==='24h') timeFilter.setDate(now.getDate()-1);
      else if (timeframe==='7d') timeFilter.setDate(now.getDate()-7);
      else if (timeframe==='30d') timeFilter.setDate(now.getDate()-30);

      let filter = { isResolved: resolved };
      if (severity) filter.severity = severity;
      filter.createdAt = { $gte: timeFilter };

      const alerts = await Alert.find(filter).sort({ createdAt: -1 }).limit(100).lean();
      const stats = {
        total: alerts.length,
        critical: alerts.filter(a=>a.severity==='critical').length,
        high: alerts.filter(a=>a.severity==='high').length,
        medium: alerts.filter(a=>a.severity==='medium').length,
        low: alerts.filter(a=>a.severity==='low').length
      };

      res.json({ success: true, data: { alerts, statistics: stats }, filters: { severity: severity||'all', timeframe, resolved } });
    })
  );

  return router;
};
