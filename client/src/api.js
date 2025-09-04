// src/api.js
const axios = require('axios');

class ApiClient {
  constructor(baseURL = 'http://localhost:3001', apiKey = 'your-api-key') {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.client = this.createClient();
  }

  createClient() {
    return axios.create({
      baseURL: this.baseURL,
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': this.apiKey,
        'User-Agent': 'SystemMonitor-Client/1.0.0'
      }
    });
  }

  updateConfig(baseURL, apiKey) {
    this.baseURL = baseURL;
    this.apiKey = apiKey;
    this.client = this.createClient();
  }

  async sendSystemData(data) {
    try {
      const response = await this.client.post('/api/machines', data);
      console.log('Data sent successfully:', response.status);
      return response.data;
    } catch (error) {
      if (error.response) {
        console.error('Server error:', error.response.status, error.response.data);
        throw new Error(`Server responded with ${error.response.status}: ${error.response.data.error || 'Unknown error'}`);
      } else if (error.request) {
        console.error('Network error - no response received');
        throw new Error('Unable to connect to server. Please check your network connection and API URL.');
      } else {
        console.error('Request error:', error.message);
        throw error;
      }
    }
  }

  async testConnection() {
    try {
      const response = await this.client.get('/health');
      return { success: true, data: response.data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
}

module.exports = ApiClient;