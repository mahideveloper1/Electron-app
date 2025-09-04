const express = require('express');
const bcrypt = require('bcryptjs');
const { body, validationResult } = require('express-validator');
const { generateToken, verifyToken } = require('../middleware/auth');
const { asyncHandler, formatValidationErrors } = require('../middleware/errorHandler');
const { v4: uuidv4 } = require('uuid');

const router = express.Router();

module.exports = (models) => {
  const { ApiKey, User } = models;

  // Validation middleware
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

  // POST /auth/login - Simple login for dashboard access
  router.post('/login',
    [
      body('username').notEmpty().withMessage('Username is required'),
      body('password').notEmpty().withMessage('Password is required')
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { username, password } = req.body;

      // Optional: fetch from DB
      const admin = await User.findOne({ username }).lean();
      const validPassword = admin ? admin.passwordHash : process.env.ADMIN_PASSWORD || 'admin123';
      if (!admin && username !== (process.env.ADMIN_USERNAME || 'admin')) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

      const passwordMatch = admin ? bcrypt.compareSync(password, admin.passwordHash) : password === validPassword;
      if (!passwordMatch) return res.status(401).json({ error: 'Invalid credentials' });

      const token = generateToken({
        username,
        role: 'admin',
        permissions: ['read', 'write', 'admin']
      });

      res.json({
        success: true,
        token,
        user: { username, role: 'admin' }
      });
    })
  );

  // POST /auth/api-keys - Create new API key
  router.post('/api-keys',
    verifyToken,
    [
      body('name').notEmpty().withMessage('API key name is required'),
      body('permissions').isArray().withMessage('Permissions must be an array'),
      body('expiresInDays').optional().isInt({ min: 1, max: 365 }).withMessage('Expiration must be between 1 and 365 days')
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { name, permissions = ['read'], expiresInDays } = req.body;

      const apiKeyPlain = uuidv4();
      const keyHash = bcrypt.hashSync(apiKeyPlain, 12);

      let expiresAt = null;
      if (expiresInDays) expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);

      const apiKeyDoc = await ApiKey.create({
        name,
        keyHash,
        permissions,
        expiresAt,
        isActive: true,
        createdAt: new Date()
      });

      res.status(201).json({
        success: true,
        message: 'API key created successfully',
        apiKey: apiKeyPlain, // return only once
        keyInfo: {
          id: apiKeyDoc._id,
          name,
          permissions,
          expiresAt,
          createdAt: apiKeyDoc.createdAt
        }
      });
    })
  );

  // GET /auth/api-keys - List API keys
  router.get('/api-keys',
    verifyToken,
    asyncHandler(async (req, res) => {
      const keys = await ApiKey.find().sort({ createdAt: -1 }).lean();
      const processedKeys = keys.map(key => ({
        ...key,
        isActive: Boolean(key.isActive)
      }));
      res.json({ success: true, data: processedKeys });
    })
  );

  // PUT /auth/api-keys/:keyId - Update API key
  router.put('/api-keys/:keyId',
    verifyToken,
    [
      body('name').optional().notEmpty(),
      body('permissions').optional().isArray(),
      body('isActive').optional().isBoolean()
    ],
    handleValidation,
    asyncHandler(async (req, res) => {
      const { keyId } = req.params;
      const updates = req.body;

      const updated = await ApiKey.findByIdAndUpdate(keyId, {
        ...updates,
        updatedAt: new Date()
      }, { new: true });

      if (!updated) return res.status(404).json({ error: 'API key not found' });
      res.json({ success: true, message: 'API key updated successfully' });
    })
  );

  // DELETE /auth/api-keys/:keyId - Delete API key
  router.delete('/api-keys/:keyId',
    verifyToken,
    asyncHandler(async (req, res) => {
      const { keyId } = req.params;
      const deleted = await ApiKey.findByIdAndDelete(keyId);
      if (!deleted) return res.status(404).json({ error: 'API key not found' });
      res.json({ success: true, message: 'API key deleted successfully' });
    })
  );

  // POST /auth/verify - Verify token
  router.post('/verify',
    verifyToken,
    (req, res) => {
      res.json({ success: true, user: req.user });
    }
  );

  return router;
};
