const { pool, generateId, getOrCreateNameId } = require('../config/database');
const {
  parseMonitXml,
  extractHostInfo,
  extractServices,
  extractEvents
} = require('../parsers/monitParser');

/**
 * Process incoming Monit data
 */
async function processMonitData(xmlData, sourceIp) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // Parse XML
    const monitData = await parseMonitXml(xmlData);
    const hostInfo = extractHostInfo(monitData);
    const services = extractServices(monitData);
    const events = extractEvents(monitData);
    
    // Create or update host
    const hostId = await upsertHost(client, hostInfo, sourceIp);
    
    // Update services
    await updateServices(client, hostId, services);
    
    // Store events
    if (events.length > 0) {
      await storeEvents(client, hostId, events);
    }
    
    await client.query('COMMIT');
    
    return {
      success: true,
      hostId,
      hostname: hostInfo.localhostname,
      servicesCount: services.length,
      eventsCount: events.length
    };
    
  } catch (error) {
    await client.query('ROLLBACK');
    console.error('Error processing Monit data:', error);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Create or update host in database
 */
async function upsertHost(client, hostInfo, sourceIp) {
  const nameId = await getOrCreateNameId(client, hostInfo.localhostname);
  const controlFileNameId = await getOrCreateNameId(client, hostInfo.controlfile);
  const now = Math.floor(Date.now() / 1000);
  
  // Clean IPv6-mapped IPv4 address (::ffff:10.5.10.4 -> 10.5.10.4)
  const cleanSourceIp = sourceIp.replace('::ffff:', '');
  
  // Check if host exists by monitid (like M/Monit does)
  const checkResult = await client.query(
    'SELECT id, incarnation FROM host WHERE monitid = $1',
    [hostInfo.monitId]
  );
  
  let hostId;
  
  if (checkResult.rows.length > 0) {
    // Update existing host
    hostId = checkResult.rows[0].id;
    const oldIncarnation = checkResult.rows[0].incarnation;
    const isReincarnation = oldIncarnation !== hostInfo.incarnation;
    
    await client.query(`
      UPDATE host SET
        updated_at = $1,
        incarnation = $2,
        status = $3,
        ipaddrin = $4,
        ipaddrout = $5,
        portin = $6,
        portout = $7,
        sslin = $8,
        sslout = $9,
        poll = $10,
        startdelay = $11,
        controlfilenameid = $12,
        version = $13,
        platformname = $14,
        platformrelease = $15,
        platformversion = $16,
        platformmachine = $17,
        platformcpu = $18,
        platformmemory = $19,
        platformswap = $20,
        platformuptime = $21,
        statusmodified = $22
      WHERE id = $23
    `, [
      now,
      hostInfo.incarnation,
      0, // status OK
      hostInfo.httpd.address, // ipaddrin from Monit config
      cleanSourceIp, // ipaddrout = real IP
      hostInfo.httpd.port,
      hostInfo.httpd.port, // portout = same as portin
      hostInfo.httpd.ssl ? 1 : 0,
      hostInfo.httpd.ssl ? 1 : 0, // sslout = same as sslin
      hostInfo.poll,
      hostInfo.startdelay,
      controlFileNameId,
      hostInfo.version,
      hostInfo.platform.name,
      hostInfo.platform.release,
      hostInfo.platform.version,
      hostInfo.platform.machine,
      hostInfo.platform.cpu,
      hostInfo.platform.memory,
      hostInfo.platform.swap,
      hostInfo.uptime,
      now,
      hostId
    ]);
    
    if (isReincarnation) {
      console.log(`[Collector] Host ${hostInfo.localhostname} reincarnated (incarnation: ${oldIncarnation} -> ${hostInfo.incarnation})`);
    }
    
  } else {
    // Insert new host
    hostId = generateId();
    
    await client.query(`
      INSERT INTO host (
        id, created_at, updated_at, incarnation, status, nameid,
        monitid, ipaddrin, ipaddrout, portin, portout, sslin, sslout,
        poll, startdelay, controlfilenameid, statusmodified, version,
        platformname, platformrelease, platformversion, platformmachine,
        platformcpu, platformmemory, platformswap, platformuptime
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
        $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26
      )
    `, [
      hostId, now, now, hostInfo.incarnation, 0, nameId,
      hostInfo.monitId, hostInfo.httpd.address, cleanSourceIp, // ipaddrin from config, ipaddrout=real IP
      hostInfo.httpd.port, hostInfo.httpd.port, // portin and portout
      hostInfo.httpd.ssl ? 1 : 0, hostInfo.httpd.ssl ? 1 : 0, // sslin and sslout
      hostInfo.poll, hostInfo.startdelay, controlFileNameId, now,
      hostInfo.version, hostInfo.platform.name, hostInfo.platform.release,
      hostInfo.platform.version, hostInfo.platform.machine, hostInfo.platform.cpu,
      hostInfo.platform.memory, hostInfo.platform.swap, hostInfo.uptime
    ]);
    
    console.log(`[Collector] New host registered: ${hostInfo.localhostname} (${cleanSourceIp})`);
  }
  
  return hostId;
}

/**
 * Update services for a host
 */
async function updateServices(client, hostId, services) {
  const now = Math.floor(Date.now() / 1000);
  
  for (const service of services) {
    const serviceNameId = await getOrCreateNameId(client, service.name);
    
    // Check if service exists
    const checkResult = await client.query(
      'SELECT id FROM service WHERE hostid = $1 AND nameid = $2',
      [hostId, serviceNameId]
    );
    
    let serviceId;
    
    if (checkResult.rows.length > 0) {
      // Update existing service
      serviceId = checkResult.rows[0].id;
      
      await client.query(`
        UPDATE service SET
          updated_at = $1,
          type = $2,
          status = $3,
          statushint = $4,
          monitoringstate = $5,
          monitoringmode = $6,
          onreboot = $7,
          statusmodified = $8
        WHERE id = $9
      `, [
        now, service.type, service.status, service.statusHint,
        service.monitoringState, service.monitoringMode, service.onReboot,
        now, serviceId
      ]);
      
    } else {
      // Insert new service
      serviceId = generateId();
      
      await client.query(`
        INSERT INTO service (
          id, created_at, updated_at, nameid, hostid, type,
          status, statushint, monitoringstate, monitoringmode,
          onreboot, statusmodified
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
        )
      `, [
        serviceId, now, now, serviceNameId, hostId, service.type,
        service.status, service.statusHint, service.monitoringState,
        service.monitoringMode, service.onReboot, now
      ]);
    }
    
    // Store statistics
    await storeStatistics(client, serviceId, service, now);
  }
}

/**
 * Store service statistics
 */
async function storeStatistics(client, serviceId, service, collectedSec) {
  // System statistics (CPU, Memory, Load)
  if (service.system) {
    if (service.system.cpu) {
      await storeMetric(client, serviceId, 'cpu_user', service.system.cpu.user, collectedSec);
      await storeMetric(client, serviceId, 'cpu_system', service.system.cpu.system, collectedSec);
    }
    
    if (service.system.memory) {
      await storeMetric(client, serviceId, 'memory_percent', service.system.memory.percent, collectedSec);
      await storeMetric(client, serviceId, 'memory_kilobyte', service.system.memory.kilobyte, collectedSec);
    }
    
    if (service.system.load) {
      await storeMetric(client, serviceId, 'load_avg01', service.system.load.avg01, collectedSec);
      await storeMetric(client, serviceId, 'load_avg05', service.system.load.avg05, collectedSec);
      await storeMetric(client, serviceId, 'load_avg15', service.system.load.avg15, collectedSec);
    }
  }
  
  // Process statistics
  if (service.process && service.process.memory) {
    await storeMetric(client, serviceId, 'process_memory_percent', service.process.memory.percent, collectedSec);
    await storeMetric(client, serviceId, 'process_memory_kilobyte', service.process.memory.kilobyte, collectedSec);
  }
  
  // Filesystem statistics
  if (service.filesystem) {
    await storeMetric(client, serviceId, 'filesystem_percent', service.filesystem.percent, collectedSec);
    await storeMetric(client, serviceId, 'filesystem_usage', service.filesystem.usage, collectedSec);
  }
}

/**
 * Store individual metric
 */
async function storeMetric(client, serviceId, descriptor, value, collectedSec) {
  if (value === undefined || value === null) return;
  
  // Get or create statistics entry
  const statsResult = await client.query(
    'SELECT id FROM statistics WHERE serviceid = $1 AND descriptor = $2',
    [serviceId, descriptor]
  );
  
  let statisticsId;
  
  if (statsResult.rows.length > 0) {
    statisticsId = statsResult.rows[0].id;
  } else {
    statisticsId = generateId();
    await client.query(`
      INSERT INTO statistics (id, serviceid, type, datatype, descriptor)
      VALUES ($1, $2, $3, $4, $5)
    `, [statisticsId, serviceId, 0, 5, descriptor]); // datatype 5 = double
  }
  
  // Store value
  await client.query(`
    INSERT INTO statistics_double (statisticsid, collectedsec, value)
    VALUES ($1, $2, $3)
  `, [statisticsId, collectedSec, value]);
}

/**
 * Store events
 */
async function storeEvents(client, hostId, events) {
  for (const event of events) {
    const eventId = generateId();
    const serviceNameId = await getOrCreateNameId(client, event.service);
    
    // Get serviceid
    const serviceResult = await client.query(
      'SELECT id FROM service WHERE hostid = $1 AND nameid = $2',
      [hostId, serviceNameId]
    );
    
    if (serviceResult.rows.length === 0) continue;
    
    const serviceId = serviceResult.rows[0].id;
    
    await client.query(`
      INSERT INTO event (
        id, hostid, serviceid, collectedsec, collectedusec,
        service_nameid, servicetype, event, state, action,
        message, active
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12
      )
    `, [
      eventId, hostId, serviceId, event.collected.sec, event.collected.usec,
      serviceNameId, event.type, event.id, event.state, event.action,
      event.message, 1
    ]);
  }
}

module.exports = { processMonitData };
