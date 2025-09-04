//src/monitor.js
const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { machineId } = require('node-machine-id');
const cron = require('node-cron');
const ApiClient = require('./api');
const SystemChecks = require('./utils/system-checks');

class SystemMonitor {
  constructor(settings = {}) {
    this.settings = {
      apiUrl: settings.apiUrl || 'http://localhost:3001',
      apiKey: settings.apiKey || 'your-api-key',
      checkInterval: settings.checkInterval || 30,
      ...settings
    };
    
    this.api = new ApiClient(this.settings.apiUrl, this.settings.apiKey);
    this.systemChecks = new SystemChecks();
    this.lastState = null;
    this.machineId = null;
    this.cronJob = null;
    this.running = false;
    this.lastCheck = null;
    this.nextCheck = null;
  }

  async start() {
    if (this.running) {
      console.log('Monitor is already running');
      return;
    }

    try {
      this.machineId = await machineId();
      console.log('System Monitor started for machine:', this.machineId);
      
      this.running = true;
      
      // Run initial check
      await this.runCheck();
      
      // Schedule periodic checks based on interval setting
      const cronPattern = this.getCronPattern(this.settings.checkInterval);
      this.cronJob = cron.schedule(cronPattern, () => {
        this.runCheck();
      });
      
      console.log(`Scheduled checks every ${this.settings.checkInterval} minutes`);
      
    } catch (error) {
      console.error('Failed to start system monitor:', error);
      this.running = false;
      throw error;
    }
  }

  stop() {
    if (!this.running) {
      console.log('Monitor is not running');
      return;
    }

    if (this.cronJob) {
      this.cronJob.destroy();
      this.cronJob = null;
    }
    
    this.running = false;
    console.log('System Monitor stopped');
  }

  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings };
    this.api.updateConfig(this.settings.apiUrl, this.settings.apiKey);
    
    // Restart with new interval if running
    if (this.running) {
      this.stop();
      this.start();
    }
  }

  isRunning() {
    return this.running;
  }

  getLastCheck() {
    return this.lastCheck;
  }

  getNextCheck() {
    return this.nextCheck;
  }

  getCronPattern(minutes) {
    if (minutes >= 60) {
      const hours = Math.floor(minutes / 60);
      return `0 */${hours} * * *`;
    } else {
      return `*/${minutes} * * * *`;
    }
  }

  async runCheck() {
    if (!this.machineId) {
      try {
        this.machineId = await machineId();
      } catch (error) {
        console.error('Failed to get machine ID:', error);
        return;
      }
    }

    try {
      console.log('Running system check...');
      this.lastCheck = new Date();
      
      const currentState = await this.getSystemState();
      
      // Only send data if there's a change or if it's been more than 24 hours
      const shouldSend = !this.lastState || 
                        this.hasStateChanged(currentState) || 
                        this.shouldSendHeartbeat();
      
      if (shouldSend) {
        await this.api.sendSystemData(currentState);
        this.lastState = currentState;
        console.log('System state sent to server');
      } else {
        console.log('No changes detected, skipping update');
      }
      
      // Calculate next check time
      this.nextCheck = new Date(Date.now() + (this.settings.checkInterval * 60 * 1000));
      
    } catch (error) {
      console.error('System check failed:', error);
    }
  }

  async getSystemState() {
    const platform = os.platform();
    
    const state = {
      machineId: this.machineId,
      platform: platform,
      hostname: os.hostname(),
      timestamp: new Date().toISOString(),
      osInfo: {
        type: os.type(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime()
      },
      diskEncryption: await this.systemChecks.checkDiskEncryption(),
      osUpdates: await this.systemChecks.checkOSUpdates(),
      antivirus: await this.systemChecks.checkAntivirus(),
      sleepSettings: await this.systemChecks.checkSleepSettings(),
      systemInfo: {
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        cpus: os.cpus().length,
        loadAverage: os.loadavg()
      }
    };

    return state;
  }

  hasStateChanged(newState) {
    if (!this.lastState) return true;
    
    const keys = ['diskEncryption', 'osUpdates', 'antivirus', 'sleepSettings'];
    return keys.some(key => 
      JSON.stringify(this.lastState[key]) !== JSON.stringify(newState[key])
    );
  }

  shouldSendHeartbeat() {
    if (!this.lastState) return true;
    
    const lastSent = new Date(this.lastState.timestamp);
    const hoursSinceLastSent = (Date.now() - lastSent.getTime()) / (1000 * 60 * 60);
    
    return hoursSinceLastSent >= 24;
  }
}

module.exports = SystemMonitor;