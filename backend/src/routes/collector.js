const express = require('express');
const router = express.Router();
const { processMonitData } = require('../services/collectorService');

/**
 * POST /collector
 * Receives data from Monit instances
 */
router.post('/', async (req, res) => {
  try {
    // Get raw XML body
    const xmlData = req.body;
    
    if (!xmlData) {
      return res.status(400).send('No data received');
    }
    
    // Get source IP
    const sourceIp = req.ip || req.connection.remoteAddress;
    
    console.log(`[Collector] Received data from ${sourceIp}`);
    
    // Process the data
    const result = await processMonitData(xmlData, sourceIp);
    
    console.log(`[Collector] Processed: ${result.hostname} - ${result.servicesCount} services, ${result.eventsCount} events`);
    
    // Return empty response (Monit expects minimal response)
    res.status(200).send('OK');
    
  } catch (error) {
    console.error('[Collector] Error:', error);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
