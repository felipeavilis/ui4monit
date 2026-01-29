const express = require('express');
const router = express.Router();
const { pool } = require('../config/database');

/**
 * GET /api/hosts
 * Get all monitored hosts with their status
 */
router.get('/hosts', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        h.id,
        n.name as hostname,
        h.monitid,
        h.ipaddrin,
        h.portin,
        h.status,
        h.updated_at,
        h.version,
        h.platformname,
        h.platformrelease,
        h.platformcpu,
        h.platformmemory,
        h.platformswap,
        h.serviceup,
        h.servicedown,
        COUNT(DISTINCT s.id) as service_count,
        COUNT(DISTINCT CASE WHEN s.status != 0 THEN s.id END) as service_issues
      FROM host h
      JOIN name n ON h.nameid = n.id
      LEFT JOIN service s ON s.hostid = h.id
      GROUP BY h.id, n.name
      ORDER BY n.name
    `);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching hosts:', error);
    res.status(500).json({ error: 'Failed to fetch hosts' });
  }
});

/**
 * GET /api/hosts/:id
 * Get detailed information about a specific host
 */
router.get('/hosts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        h.*,
        n.name as hostname,
        cf.name as controlfile
      FROM host h
      JOIN name n ON h.nameid = n.id
      JOIN name cf ON h.controlfilenameid = cf.id
      WHERE h.id = $1
    `, [id]);
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Host not found' });
    }
    
    res.json(result.rows[0]);
  } catch (error) {
    console.error('Error fetching host:', error);
    res.status(500).json({ error: 'Failed to fetch host' });
  }
});

/**
 * GET /api/hosts/:id/services
 * Get all services for a specific host
 */
router.get('/hosts/:id/services', async (req, res) => {
  try {
    const { id } = req.params;
    
    const result = await pool.query(`
      SELECT 
        s.id,
        n.name as service_name,
        s.type,
        s.status,
        s.statushint,
        s.monitoringstate,
        s.monitoringmode,
        s.updated_at,
        s.statusmodified
      FROM service s
      JOIN name n ON s.nameid = n.id
      WHERE s.hostid = $1
      ORDER BY s.type, n.name
    `, [id]);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching services:', error);
    res.status(500).json({ error: 'Failed to fetch services' });
  }
});

/**
 * GET /api/events
 * Get recent events with optional filters
 */
router.get('/events', async (req, res) => {
  try {
    const { hostid, limit = 100 } = req.query;
    
    let query = `
      SELECT 
        e.id,
        e.collectedsec,
        e.collectedusec,
        h.id as host_id,
        hn.name as host_name,
        sn.name as service_name,
        e.servicetype,
        e.event,
        e.state,
        e.action,
        e.message,
        e.active
      FROM event e
      JOIN host h ON e.hostid = h.id
      JOIN name hn ON h.nameid = hn.id
      JOIN name sn ON e.service_nameid = sn.id
    `;
    
    const params = [];
    
    if (hostid) {
      query += ' WHERE e.hostid = $1';
      params.push(hostid);
    }
    
    query += ` ORDER BY e.collectedsec DESC, e.collectedusec DESC LIMIT $${params.length + 1}`;
    params.push(limit);
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching events:', error);
    res.status(500).json({ error: 'Failed to fetch events' });
  }
});

/**
 * GET /api/statistics/:serviceid
 * Get statistics for a service
 */
router.get('/statistics/:serviceid', async (req, res) => {
  try {
    const { serviceid } = req.params;
    const { from, to, descriptor } = req.query;
    
    let query = `
      SELECT 
        st.descriptor,
        sd.collectedsec,
        sd.value
      FROM statistics st
      JOIN statistics_double sd ON st.id = sd.statisticsid
      WHERE st.serviceid = $1
    `;
    
    const params = [serviceid];
    
    if (descriptor) {
      query += ` AND st.descriptor = $${params.length + 1}`;
      params.push(descriptor);
    }
    
    if (from) {
      query += ` AND sd.collectedsec >= $${params.length + 1}`;
      params.push(from);
    }
    
    if (to) {
      query += ` AND sd.collectedsec <= $${params.length + 1}`;
      params.push(to);
    }
    
    query += ' ORDER BY sd.collectedsec DESC LIMIT 1000';
    
    const result = await pool.query(query, params);
    
    res.json(result.rows);
  } catch (error) {
    console.error('Error fetching statistics:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/dashboard
 * Get dashboard summary data
 */
router.get('/dashboard', async (req, res) => {
  try {
    // Get overall stats
    const stats = await pool.query(`
      SELECT 
        COUNT(DISTINCT h.id) as total_hosts,
        COUNT(DISTINCT CASE WHEN h.status = 0 THEN h.id END) as hosts_ok,
        COUNT(DISTINCT s.id) as total_services,
        COUNT(DISTINCT CASE WHEN s.status = 0 THEN s.id END) as services_ok,
        COUNT(DISTINCT CASE WHEN e.active = 1 THEN e.id END) as active_events
      FROM host h
      LEFT JOIN service s ON s.hostid = h.id
      LEFT JOIN event e ON e.hostid = h.id
    `);
    
    // Get recent events
    const recentEvents = await pool.query(`
      SELECT 
        e.collectedsec,
        hn.name as host_name,
        sn.name as service_name,
        e.message,
        e.state
      FROM event e
      JOIN host h ON e.hostid = h.id
      JOIN name hn ON h.nameid = hn.id
      JOIN name sn ON e.service_nameid = sn.id
      WHERE e.active = 1
      ORDER BY e.collectedsec DESC
      LIMIT 10
    `);
    
    res.json({
      stats: stats.rows[0],
      recentEvents: recentEvents.rows
    });
  } catch (error) {
    console.error('Error fetching dashboard data:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard data' });
  }
});

module.exports = router;
