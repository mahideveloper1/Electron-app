const mongoose = require('mongoose');

const machineSchema = new mongoose.Schema({
  machineId: { type: String, required: true, unique: true },
  hostname: { type: String },
  platform: { type: String },
  lastSeen: { type: Date, default: Date.now },
  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date }
});

module.exports = mongoose.model('Machine', machineSchema);
