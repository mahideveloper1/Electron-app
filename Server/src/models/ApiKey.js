const mongoose = require('mongoose');

const apiKeySchema = new mongoose.Schema({
  name: { type: String, required: true },
  keyHash: { type: String, required: true },
  permissions: { type: [String], default: ['read'] },
  expiresAt: { type: Date, default: null },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

module.exports = mongoose.model('ApiKey', apiKeySchema);
