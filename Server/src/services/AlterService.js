class AlertService {
  constructor(db) {
    this.db = db;
  }

  async analyzeSystemData(systemData) {
    const { machineId, diskEncryption, osUpdates, antivirus, sleepSettings } = systemData;
    
    try {
      // Check disk encryption
      await this.checkDiskEncryptionAlert(machineId, diskEncryption);
      
      // Check OS updates
      await this.checkOSUpdatesAlert(machineId, osUpdates);
      
      // Check antivirus
      await this.checkAntivirusAlert(machineId, antivirus);
      
      // Check sleep settings
      await this.checkSleepSettingsAlert(machineId, sleepSettings);
      
    } catch (error) {
      console.error('Error analyzing system data for alerts:', error);
    }
  }

  async checkDiskEncryptionAlert(machineId, diskEncryption) {
    if (!diskEncryption || !diskEncryption.encrypted) {
      await this.createAlertIfNotExists(
        machineId,
        'disk_encryption',
        'high',
        'Disk Encryption Disabled',
        `Machine ${machineId} does not have disk encryption enabled. This poses a significant security risk.`
      );
    } else {
      // Resolve existing encryption alerts if disk is now encrypted
      await this.resolveAlertByType(machineId, 'disk_encryption');
    }
  }

  async checkOSUpdatesAlert(machineId, osUpdates) {
    if (!osUpdates || !osUpdates.upToDate) {
      const severity = osUpdates?.daysBehind > 30 ? 'high' : 'medium';
      const message = osUpdates?.daysBehind 
        ? `Machine ${machineId} is ${osUpdates.daysBehind} days behind on OS updates.`
        : `Machine ${machineId} has pending OS updates.`;
        
      await this.createAlertIfNotExists(
        machineId,
        'os_updates',
        severity,
        'OS Updates Required',
        message
      );
    } else {
      await this.resolveAlertByType(machineId, 'os_updates');
    }
  }

  async checkAntivirusAlert(machineId, antivirus) {
    if (!antivirus || !antivirus.installed) {
      await this.createAlertIfNotExists(
        machineId,
        'antivirus_missing',
        'high',
        'Antivirus Not Installed',
        `Machine ${machineId} does not have antivirus software installed.`
      );
    } else if (!antivirus.enabled) {
      await this.createAlertIfNotExists(
        machineId,
        'antivirus_disabled',
        'medium',
        'Antivirus Disabled',
        `Machine ${machineId} has antivirus software installed but it is not enabled.`
      );
      // Resolve missing antivirus alert since it's installed
      await this.resolveAlertByType(machineId, 'antivirus_missing');
    } else {
      // Antivirus is installed and enabled, resolve both alert types
      await this.resolveAlertByType(machineId, 'antivirus_missing');
      await this.resolveAlertByType(machineId, 'antivirus_disabled');
      
      // Check if definitions are outdated
      if (antivirus.definitionsOutdated) {
        await this.createAlertIfNotExists(
          machineId,
          'antivirus_outdated',
          'medium',
          'Antivirus Definitions Outdated',
          `Machine ${machineId} has outdated antivirus definitions.`
        );
      } else {
        await this.resolveAlertByType(machineId, 'antivirus_outdated');
      }
    }
  }

  async checkSleepSettingsAlert(machineId, sleepSettings) {
    if (!sleepSettings || sleepSettings.sleepTimeout > 10) {
      const timeout = sleepSettings?.sleepTimeout || 'unknown';
      await this.createAlertIfNotExists(
        machineId,
        'sleep_timeout',
        'low',
        'Sleep Timeout Too Long',
        `Machine ${machineId} has sleep timeout set to ${timeout} minutes. Recommended: ≤10 minutes.`
      );
    } else {
      await this.resolveAlertByType(machineId, 'sleep_timeout');
    }
  }

  async createAlertIfNotExists(machineId, alertType, severity, title, message) {
    // Check if a similar unresolved alert already exists
    const existingAlert = await new Promise((resolve, reject) => {
      this.db.db.get(
        'SELECT id FROM alerts WHERE machine_id = ? AND alert_type = ? AND is_resolved = 0',
        [machineId, alertType],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });

    if (!existingAlert) {
      await this.db.createAlert({
        machineId,
        alertType,
        severity,
        title,
        message
      });
      console.log(`Created ${severity} alert for ${machineId}: ${title}`);
    }
  }

  async resolveAlertByType(machineId, alertType) {
    return new Promise((resolve, reject) => {
      this.db.db.run(
        'UPDATE alerts SET is_resolved = 1, resolved_at = CURRENT_TIMESTAMP WHERE machine_id = ? AND alert_type = ? AND is_resolved = 0',
        [machineId, alertType],
        function(err) {
          if (err) {
            reject(err);
          } else {
            if (this.changes > 0) {
              console.log(`Resolved ${alertType} alerts for machine ${machineId}`);
            }
            resolve(this.changes);
          }
        }
      );
    });
  }

  async getAlertSummary() {
    return new Promise((resolve, reject) => {
      this.db.db.get(`
        SELECT 
          COUNT(*) as total_alerts,
          SUM(CASE WHEN severity = 'critical' THEN 1 ELSE 0 END) as critical,
          SUM(CASE WHEN severity = 'high' THEN 1 ELSE 0 END) as high,
          SUM(CASE WHEN severity = 'medium' THEN 1 ELSE 0 END) as medium,
          SUM(CASE WHEN severity = 'low' THEN 1 ELSE 0 END) as low,
          SUM(CASE WHEN created_at > datetime('now', '-24 hours') THEN 1 ELSE 0 END) as last_24h
        FROM alerts 
        WHERE is_resolved = 0
      `, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  }

  async getMachineRiskScore(machineId) {
    const alerts = await this.db.getAlerts(machineId, false);
    
    let riskScore = 0;
    const severityWeights = {
      critical: 10,
      high: 7,
      medium: 4,
      low: 1
    };

    alerts.forEach(alert => {
      riskScore += severityWeights[alert.severity] || 0;
    });

    // Normalize to 0-100 scale
    const maxPossibleScore = 50; // Arbitrary max for normalization
    const normalizedScore = Math.min(100, (riskScore / maxPossibleScore) * 100);

    return {
      score: Math.round(normalizedScore),
      level: normalizedScore >= 80 ? 'critical' : 
             normalizedScore >= 60 ? 'high' : 
             normalizedScore >= 30 ? 'medium' : 'low',
      alertCount: alerts.length,
      rawScore: riskScore
    };
  }

  async cleanupOldResolvedAlerts(daysToKeep = 30) {
    const cutoffDate = new Date(Date.now() - (daysToKeep * 24 * 60 * 60 * 1000)).toISOString();
    
    return new Promise((resolve, reject) => {
      this.db.db.run(
        'DELETE FROM alerts WHERE is_resolved = 1 AND resolved_at < ?',
        [cutoffDate],
        function(err) {
          if (err) {
            reject(err);
          } else {
            console.log(`Cleaned up ${this.changes} old resolved alerts`);
            resolve(this.changes);
          }
        }
      );
    });
  }
}

module.exports = AlertService;