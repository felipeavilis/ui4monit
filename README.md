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
set mmonit http://your-server:3001/collector
```

# 📋 Project Status

- ✅ Backend collector with Monit protocol support
- ✅ REST API for data access
- ✅ PostgreSQL database schema
- 🚧 React dashboard (in progress)
- 🚧 Real-time metrics charts
- 📅 Alerting system (planned)

# 🤝 Contributing
Contributions are welcome! This project aims to provide a truly free alternative to commercial monitoring solutions.

# 📄 License

MIT License - Free for personal and commercial use.
