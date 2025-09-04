# System Monitor Utility

A **cross-platform system monitoring tool** that collects system health metrics from client machines and sends them to a secure backend for dashboard visualization. Built with **Electron** (client) and **Node.js + Express + MongoDB** (backend).

---

## Features

- Collects system metrics:
  - Disk encryption
  - OS updates
  - Antivirus status
  - Sleep settings
- Sends system data to backend every 30 minutes
- Centralized dashboard with:
  - Overview statistics
  - Machine health status
  - Alerts and notifications
  - Health trends over time
- Authentication via JWT and API keys
- Cross-platform client using Electron with tray menu

---

## Tech Stack

- **Backend:** Node.js, Express, MongoDB, Mongoose
- **Client:** Electron, Node.js
- **Security:** JWT, API key authentication
- **Utilities:**  CORS, Compression, Morgan, Rate-limiting

---
## Setup Backend

1. Navigate to the backend folder:

- cd backend
- npm install
- npm run dev

2. Create a .env file in backend/ with the following variables:

PORT=3001
MONGO_URI=mongodb://localhost:27017/system_monitor
ADMIN_USERNAME=admin
ADMIN_PASSWORD=admin123
ALLOWED_ORIGINS=http://localhost:3000 , http://localhost:3001
JWT_SECRET=your_jwt_secret

## Setip Client

1. cd client
2. npm install
3. npm start





