// src/utils/config.js
const Store = require('electron-store');

class ConfigManager {
  constructor() {
    this.store = new Store({
      name: 'system-monitor-config',
      defaults: {
        apiUrl: 'http://localhost:3001',
        apiKey: 'your-api-key',
        checkInterval: 30,
        runOnStartup: true,
        minimizeToTray: true,
        enableNotifications: true,
        logLevel: 'info'
      }
    });
  }

  get(key, defaultValue = null) {
    return this.store.get(key, defaultValue);
  }

  set(key, value) {
    return this.store.set(key, value);
  }

  getAll() {
    return this.store.store;
  }

  setAll(config) {
    Object.keys(config).forEach(key => {
      this.store.set(key, config[key]);
    });
  }

  reset() {
    this.store.clear();
  }

  validateConfig(config) {
    const errors = [];

    if (!config.apiUrl || typeof config.apiUrl !== 'string') {
      errors.push('API URL is required and must be a valid URL');
    }

    if (!config.apiKey || typeof config.apiKey !== 'string') {
      errors.push('API Key is required');
    }

    if (config.checkInterval < 5 || config.checkInterval > 1440) {
      errors.push('Check interval must be between 5 and 1440 minutes');
    }

    return errors;
  }
}

module.exports = ConfigManager;