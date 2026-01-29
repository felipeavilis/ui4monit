require('dotenv').config();
require('express-async-errors');
const express = require('express');
const cors = require('cors');
const { pool } = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());

// Raw body parser for collector endpoint (Monit sends raw XML)
app.use('/collector', express.text({ type: '*/*', limit: '10mb' }));

// JSON parser for API endpoints
app.use('/api', express.json());

// Routes
const collectorRoute = require('./routes/collector');
const apiRoute = require('./routes/api');

app.use('/collector', collectorRoute);
app.use('/api', apiRoute);

// Health check
app.get('/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'ok', 
      database: 'connected',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'error', 
      database: 'disconnected',
      error: error.message
    });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'UI4Monit Backend',
    version: '1.0.0',
    endpoints: {
      collector: 'POST /collector',
      api: {
        hosts: 'GET /api/hosts',
        host: 'GET /api/hosts/:id',
        services: 'GET /api/hosts/:id/services',
        events: 'GET /api/events',
        statistics: 'GET /api/statistics/:serviceid',
        dashboard: 'GET /api/dashboard'
      }
    }
  });
});

// Error handler
app.use((error, req, res, next) => {
  console.error('Server error:', error);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : undefined
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║   UI4Monit Backend Server          ║
║   Port: ${PORT}                           ║
║   Environment: ${process.env.NODE_ENV || 'development'}            ║
╚════════════════════════════════════════╝

Endpoints:
  - Collector: http://localhost:${PORT}/collector
  - API: http://localhost:${PORT}/api
  - Health: http://localhost:${PORT}/health
  `);
});

// Graceful shutdown
process.on('SIGTERM', async () => {
  console.log('SIGTERM received, closing server...');
  await pool.end();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('SIGINT received, closing server...');
  await pool.end();
  process.exit(0);
});
