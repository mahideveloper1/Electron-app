const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// Middleware to authenticate API key
const authenticateKey = (db) => {
  return async (req, res, next) => {
    const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
    
    if (!apiKey) {
      return res.status(401).json({ 
        error: 'API key required',
        message: 'Please provide an API key in X-API-Key header or Authorization header'
      });
    }

    try {
      // For development, allow the default API key from env
      if (apiKey === process.env.API_KEY) {
        req.apiKey = { name: 'default', permissions: ['read', 'write'] };
        return next();
      }

      // Check database for API key
      const hashedKey = bcrypt.hashSync(apiKey, 10);
      const keyRecord = await new Promise((resolve, reject) => {
        db.db.get(
          'SELECT * FROM api_keys WHERE key_hash = ? AND is_active = 1',
          [hashedKey],
          (err, row) => {
            if (err) reject(err);
            else resolve(row);
          }
        );
      });

      if (!keyRecord) {
        return res.status(401).json({ 
          error: 'Invalid API key',
          message: 'The provided API key is invalid or has been revoked'
        });
      }

      // Check expiration
      if (keyRecord.expires_at && new Date(keyRecord.expires_at) < new Date()) {
        return res.status(401).json({ 
          error: 'API key expired',
          message: 'The provided API key has expired'
        });
      }

      // Update last used timestamp
      db.db.run(
        'UPDATE api_keys SET last_used = CURRENT_TIMESTAMP WHERE id = ?',
        [keyRecord.id]
      );

      req.apiKey = {
        id: keyRecord.id,
        name: keyRecord.name,
        permissions: JSON.parse(keyRecord.permissions || '["read"]')
      };

      next();
    } catch (error) {
      console.error('Authentication error:', error);
      res.status(500).json({ 
        error: 'Authentication failed',
        message: 'Internal server error during authentication'
      });
    }
  };
};

// Middleware to check permissions
const requirePermission = (permission) => {
  return (req, res, next) => {
    if (!req.apiKey) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!req.apiKey.permissions.includes(permission)) {
      return res.status(403).json({ 
        error: 'Insufficient permissions',
        message: `This operation requires '${permission}' permission`
      });
    }

    next();
  };
};

// Generate JWT token for dashboard access
const generateToken = (payload) => {
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '24h' });
};

// Verify JWT token
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token' });
  }
};

module.exports = {
  authenticateKey,
  requirePermission,
  generateToken,
  verifyToken
};