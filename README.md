# ui4monit

Open-source web interface for Monit - A modern, self-hosted alternative to M/Monit

---

UI4Monit is a free and open-source monitoring dashboard that provides centralized management and visualization for multiple Monit instances. Built with Node.js and React, it offers real-time monitoring, historical metrics, and event tracking without the licensing costs of M/Monit.

# ✨ Features

- 🔌 Drop-in M/Monit Replacement - Compatible with Monit's collector protocol
- 📊 Real-time Dashboard - Monitor all your servers from a single interface
- 📈 Historical Metrics - Track CPU, memory, disk, and service performance over time
- 🔔 Event Management - View and filter alerts and status changes
- 🐳 Docker Ready - Quick deployment with Docker Compose
- 🗄️ PostgreSQL Backend - Reliable data storage with full M/Monit schema compatibility
- 🎨 Modern UI - Clean, responsive interface built with React and Tailwind CSS

# 🚀 Quick Start

```bash
git clone https://github.com/felipeavilis/ui4monit.git
cd ui4monit
docker-compose up -d
```

Configure your Monit instances to send data:

```bash
# In /etc/monit/monitrc
set mmonit http://YOUR-IP:3001/collector
```

# 📋 Project Status

## ✅ Implemented (Phase 1 - Backend Collector)

- **Collector Backend** - Receives Monit data via POST /collector
- **Parser XML** - Processes Monit payloads
- **APIs REST** - Data query endpoints
- **Docker** - Full stack (PostgreSQL + Backend)

## Available Endpoints

```
POST   /collector              # Monit sends data here
GET    /api/hosts              # List hosts
GET    /api/hosts/:id          # Host details
GET    /api/hosts/:id/services # Host services
GET    /api/events             # Recent events
GET    /api/statistics/:id     # Historical metrics
GET    /api/dashboard          # Dashboard summary
GET    /health                 # Health check
```

## 🧪 Testing the Collector

### Option 1: Test script (simulates Monit)

```bash
cd backend
node test-collector.js
```

### Option 2: Configure a real Monit instance

On the server running Monit, edit `/etc/monit/monitrc`:

```bash
set mmonit http://YOUR-IP:3001/collector
```

Restart the service:

```bash
monit reload
```

## 📊 Check Data

```bash
# Check received hosts
curl http://localhost:3001/api/hosts

# Check events
curl http://localhost:3001/api/events

# Dashboard summary
curl http://localhost:3001/api/dashboard
```

## 🗂️ Project Structure

```
ui4monit/
├── backend/              # Node.js + Express Server
│   ├── src/
│   │   ├── config/       # Database config
│   │   ├── parsers/      # XML parser
│   │   ├── services/     # Business logic
│   │   ├── routes/       # API routes
│   │   └── server.js     # Entry point
│   ├── test-collector.js # Test script
│   └── README.md
├── database/             # PostgreSQL schema
│   └── schema.sql        # Full schema
├── frontend/             # React app (next phase)
├── docker-compose.yml    # Full stack definition
└── README.md
```

## 🔧 Development

### Backend standalone

```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

### Logs

```bash
docker-compose logs -f backend
docker-compose logs -f postgres
```

## 📝 Next Steps

### Phase 2 - Frontend Dashboard (Upcoming)
- [ ] React app with Tailwind CSS
- [ ] Dashboard with status cards
- [ ] Host/Service lists
- [ ] Real-time events
- [ ] Basic charts

### Phase 3 - Advanced Charts
- [ ] Chart.js for time-series metrics
- [ ] Aggregations (1m, 15m, 1h, etc.)
- [ ] Cross-host comparisons
- [ ] Data export

### Phase 4 - Advanced Features
- [ ] WebSocket for real-time update
- [ ] Alerting system
- [ ] User authentication
- [ ] GUser authentication

## 🎯 Goal

Create a free, open-source alternative to M/Monit with all core functionalities:
- ✅ Compatible Collector
- ✅ Metric storage
- 🔄 Modern Dashboard (In development)
- 🔄 Time-series charts (Next)
- 🔄 Configurable alerts (Future)


# 🤝 Contributing

Contributions are welcome! This project aims to provide a truly free alternative to commercial monitoring solutions.

# 📄 License

MIT License - Free for personal and commercial use.

---

**Status**: ✅ Phase 1 complete - Collector functional!
**Up Next**: 🚧 Phase 2 - Frontend Dashboard
