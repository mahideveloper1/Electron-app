const mongoose = require("mongoose");

class Database {
  constructor() {
    this.connect();
  }

  async connect() {
    try {
      await mongoose.connect(process.env.DB_PATH, {
        useNewUrlParser: true,
        useUnifiedTopology: true,
      });
      console.log("✅ Connected to MongoDB Atlas");
    } catch (err) {
      console.error("❌ MongoDB connection error:", err.message);
      process.exit(1);
    }
  }

  // Machine schema
  static Machine = mongoose.model(
    "Machine",
    new mongoose.Schema({
      machine_id: { type: String, unique: true, required: true },
      hostname: String,
      platform: String,
      os_type: String,
      os_release: String,
      os_arch: String,
      first_seen: { type: Date, default: Date.now },
      last_seen: { type: Date, default: Date.now },
      is_active: { type: Boolean, default: true },
    })
  );

  // System reports schema
  static SystemReport = mongoose.model(
    "SystemReport",
    new mongoose.Schema({
      machine_id: { type: String, required: true },
      timestamp: { type: Date, required: true },
      uptime: Number,
      total_memory: Number,
      free_memory: Number,
      cpu_count: Number,
      load_average: [Number],
      disk_encryption: mongoose.Schema.Types.Mixed,
      os_updates: mongoose.Schema.Types.Mixed,
      antivirus: mongoose.Schema.Types.Mixed,
      sleep_settings: mongoose.Schema.Types.Mixed,
      raw_data: mongoose.Schema.Types.Mixed,
      created_at: { type: Date, default: Date.now },
    })
  );

  // API keys schema
  static ApiKey = mongoose.model(
    "ApiKey",
    new mongoose.Schema({
      key_hash: { type: String, unique: true, required: true },
      name: { type: String, required: true },
      permissions: { type: [String], default: ["read", "write"] },
      is_active: { type: Boolean, default: true },
      expires_at: Date,
      created_at: { type: Date, default: Date.now },
      last_used: Date,
    })
  );

  // Alerts schema
  static Alert = mongoose.model(
    "Alert",
    new mongoose.Schema({
      machine_id: { type: String, required: true },
      alert_type: String,
      severity: String,
      title: String,
      message: String,
      is_resolved: { type: Boolean, default: false },
      created_at: { type: Date, default: Date.now },
      resolved_at: Date,
    })
  );

  // === Methods ===

  async createOrUpdateMachine(data) {
    return await Database.Machine.findOneAndUpdate(
      { machine_id: data.machineId },
      {
        hostname: data.hostname,
        platform: data.platform,
        os_type: data.osInfo?.type,
        os_release: data.osInfo?.release,
        os_arch: data.osInfo?.arch,
        last_seen: new Date(),
      },
      { upsert: true, new: true }
    );
  }

  async getAllMachines(limit = 100, skip = 0) {
    return await Database.Machine.find().sort({ last_seen: -1 }).skip(skip).limit(limit);
  }

  async createSystemReport(reportData) {
    return await Database.SystemReport.create({
      machine_id: reportData.machineId,
      timestamp: reportData.timestamp,
      uptime: reportData.osInfo?.uptime,
      total_memory: reportData.systemInfo?.totalMemory,
      free_memory: reportData.systemInfo?.freeMemory,
      cpu_count: reportData.systemInfo?.cpus,
      load_average: reportData.systemInfo?.loadAverage,
      disk_encryption: reportData.diskEncryption,
      os_updates: reportData.osUpdates,
      antivirus: reportData.antivirus,
      sleep_settings: reportData.sleepSettings,
      raw_data: reportData,
    });
  }

  async getSystemReports(machineId, limit = 50, skip = 0) {
    const filter = machineId ? { machine_id: machineId } : {};
    return await Database.SystemReport.find(filter)
      .sort({ timestamp: -1 })
      .skip(skip)
      .limit(limit);
  }

  async getLatestReport(machineId) {
    return await Database.SystemReport.findOne({ machine_id: machineId }).sort({ timestamp: -1 });
  }

  async createAlert(alertData) {
    return await Database.Alert.create(alertData);
  }

  async getAlerts(machineId = null, resolved = false, limit = 100) {
    const filter = { is_resolved: resolved };
    if (machineId) filter.machine_id = machineId;
    return await Database.Alert.find(filter).sort({ created_at: -1 }).limit(limit);
  }

  async resolveAlert(alertId) {
    return await Database.Alert.findByIdAndUpdate(alertId, {
      is_resolved: true,
      resolved_at: new Date(),
    });
  }

  async getStats() {
    const [totalMachines, activeMachines, totalReports, unresolvedAlerts] = await Promise.all([
      Database.Machine.countDocuments(),
      Database.Machine.countDocuments({ last_seen: { $gt: new Date(Date.now() - 24 * 60 * 60 * 1000) } }),
      Database.SystemReport.countDocuments(),
      Database.Alert.countDocuments({ is_resolved: false }),
    ]);

    return { totalMachines, activeMachines, totalReports, unresolvedAlerts };
  }
}

module.exports = Database;
