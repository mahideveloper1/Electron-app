const mongoose = require('mongoose');

const alertSchema = new mongoose.Schema({
  machineId: { type: String, required: true, index: true },
  severity: { type: String, enum: ['low','medium','high','critical'], default: 'low' },
  message: { type: String, required: true },
  isResolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
  resolvedAt: { type: Date, default: null }
});

module.exports = mongoose.model('Alert', alertSchema);
