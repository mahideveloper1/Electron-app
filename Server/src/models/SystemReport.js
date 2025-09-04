const mongoose = require('mongoose');

const systemReportSchema = new mongoose.Schema({
  machineId: { type: String, required: true, index: true },
  timestamp: { type: Date, default: Date.now },
  diskEncryption: { type: Object, default: {} },
  osUpdates: { type: Object, default: {} },
  antivirus: { type: Object, default: {} },
  sleepSettings: { type: Object, default: {} },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('SystemReport', systemReportSchema);
