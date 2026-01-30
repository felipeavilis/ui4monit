const { pool, generateId, getOrCreateNameId } = require('../config/database');
const {
  parseMonitXml,
  extractHostInfo,
  extractServices,
  extractEvents,
  extractServiceGroups
} = require('../parsers/monitParser');

/**
 * Process incoming Monit data
 */
async function processMonitData(xmlData, sourceIp) {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');

    // Debug: Store raw XML
    await debugStoreXml(client, xmlData);

    // Parse XML
    const monitData = await parseMonitXml(xmlData);
    const hostInfo = extractHostInfo(monitData);
    const services = extractServices(monitData);
    const events = extractEvents(monitData);
    const serviceGroups = extractServiceGroups(monitData);
    
    // Create or update host
    const hostId = await upsertHost(client, hostInfo, sourceIp);
    
    // Update services
    await updateServices(client, hostId, services);
    
    // Store service groups
    if (serviceGroups.length > 0) {
      await storeServiceGroups(client, hostId, serviceGroups, services);
    }
    
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
        uname = $8,
        password = $9,
        sslin = $10,
        sslout = $11,
        description = $12,
        poll = $13,
        startdelay = $14,
        controlfilenameid = $15,
        statusmodified = $16,
        version = $17,
        platformname = $18,
        platformrelease = $19,
        platformversion = $20,
        platformmachine = $21,
        platformcpu = $22,
        platformmemory = $23,
        platformswap = $24,
        platformuptime = $25,
        statusheartbeat = $26
      WHERE id = $27
    `, [
      now,
      hostInfo.incarnation,
      1, // status = 1 (monitored/active)
      hostInfo.httpd.address, // ipaddrin from Monit config
      cleanSourceIp, // ipaddrout = real IP
      hostInfo.httpd.port,
      hostInfo.httpd.port, // portout = same as portin
      hostInfo.credentials?.username || '',
      hostInfo.credentials?.password || '',
      hostInfo.httpd.ssl ? 1 : 0,
      -1, // sslout = -1 (default)
      '', // description = empty string
      hostInfo.poll,
      hostInfo.startdelay,
      controlFileNameId,
      now,
      hostInfo.version,
      hostInfo.platform.name,
      hostInfo.platform.release,
      hostInfo.platform.version,
      hostInfo.platform.machine,
      hostInfo.platform.cpu,
      hostInfo.platform.memory,
      hostInfo.platform.swap,
      -1, // platformuptime = -1 (not the server uptime)
      1, // statusheartbeat = 1
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
        id, created_at, updated_at, incarnation, status, nameid, keepname,
        monitid, ipaddrin, ipaddrout, portin, portout, uname, password,
        sslin, sslout, description, poll, startdelay, controlfilenameid,
        statusmodified, servicemodified, serviceskew, serviceup, servicedown,
        serviceunmonitorauto, serviceunmonitormanual, version,
        platformname, platformrelease, platformversion, platformmachine,
        platformcpu, platformmemory, platformswap, platformuptime, statusheartbeat
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
        $15, $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27,
        $28, $29, $30, $31, $32, $33, $34, $35, $36, $37
      )
    `, [
      hostId, now, now, hostInfo.incarnation, 1, nameId, 0, // status = 1, keepname = 0
      hostInfo.monitId, hostInfo.httpd.address, cleanSourceIp, // ipaddrin from config, ipaddrout=real IP
      hostInfo.httpd.port, hostInfo.httpd.port, // portin and portout
      hostInfo.credentials?.username || '',
      hostInfo.credentials?.password || '',
      hostInfo.httpd.ssl ? 1 : 0, -1, // sslin, sslout = -1
      '', // description = empty string
      hostInfo.poll, hostInfo.startdelay, controlFileNameId,
      now, // statusmodified
      0, // servicemodified (will be updated after services)
      -1, // serviceskew = -1
      0, // serviceup (will be calculated after services)
      0, // servicedown (will be calculated after services)
      0, // serviceunmonitorauto = 0
      0, // serviceunmonitormanual = 0
      hostInfo.version, hostInfo.platform.name, hostInfo.platform.release,
      hostInfo.platform.version, hostInfo.platform.machine, hostInfo.platform.cpu,
      hostInfo.platform.memory, hostInfo.platform.swap,
      -1, // platformuptime = -1
      1 // statusheartbeat = 1
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
  
  // Batch: criar todos os nameIds de uma vez
  const serviceNames = services.map(s => s.name);
  const nameIdMap = await getOrCreateNameIdsBatch(client, serviceNames);
  
  // Buscar serviços existentes de uma vez
  const existingServices = await client.query(
    'SELECT id, nameid FROM service WHERE hostid = $1',
    [hostId]
  );
  
  const existingMap = new Map(
    existingServices.rows.map(r => [r.nameid.toString(), r.id])
  );
  
  const toInsert = [];
  const toUpdate = [];
  
  for (const service of services) {
    const serviceNameId = nameIdMap[service.name];
    const existingId = existingMap.get(serviceNameId.toString());
    
    if (existingId) {
      toUpdate.push({ id: existingId, serviceNameId, service });
    } else {
      toInsert.push({ id: generateId(), serviceNameId, service });
    }
  }
  
  // Batch update usando unnest
  if (toUpdate.length > 0) {
    await client.query(`
      UPDATE service AS s SET
        updated_at = u.updated_at,
        type = u.type::integer,
        status = u.status::integer,
        statushint = u.statushint::integer,
        monitoringstate = u.monitoringstate::integer,
        monitoringmode = u.monitoringmode::integer,
        onreboot = u.onreboot::integer,
        statusmodified = u.statusmodified
      FROM unnest(
        $1::bigint[],
        $2::bigint[],
        $3::integer[],
        $4::integer[],
        $5::integer[],
        $6::integer[],
        $7::integer[],
        $8::integer[],
        $9::bigint[]
      ) AS u(id, updated_at, type, status, statushint, monitoringstate, monitoringmode, onreboot, statusmodified)
      WHERE s.id = u.id
    `, [
      toUpdate.map(u => u.id),
      toUpdate.map(() => now),
      toUpdate.map(u => u.service.type),
      toUpdate.map(u => u.service.status),
      toUpdate.map(u => u.service.statusHint),
      toUpdate.map(u => u.service.monitoringState),
      toUpdate.map(u => u.service.monitoringMode),
      toUpdate.map(u => u.service.onReboot),
      toUpdate.map(() => now)
    ]);
  }
  
  // Batch insert
  if (toInsert.length > 0) {
    const values = toInsert.map((s, i) => 
      `($${i*12+1}, $${i*12+2}, $${i*12+3}, $${i*12+4}, $${i*12+5}, $${i*12+6}, $${i*12+7}, $${i*12+8}, $${i*12+9}, $${i*12+10}, $${i*12+11}, $${i*12+12})`
    ).join(',');
    
    const params = toInsert.flatMap(s => [
      s.id, now, now, s.serviceNameId, hostId, s.service.type,
      s.service.status, s.service.statusHint, s.service.monitoringState,
      s.service.monitoringMode, s.service.onReboot, now
    ]);
    
    await client.query(`
      INSERT INTO service (id, created_at, updated_at, nameid, hostid, type, status, statushint, monitoringstate, monitoringmode, onreboot, statusmodified)
      VALUES ${values}
    `, params);
  }
  
  // Batch statistics - use collected_sec from services
  const servicesWithTime = toInsert.concat(toUpdate).map(item => ({
    ...item,
    collectedSec: item.service.collectedSec || now
  }));
  await storeStatisticsBatch(client, servicesWithTime);
  
  // Calculate and update service statistics in host table
  await updateHostServiceStats(client, hostId, now);
}

/**
 * Update host service statistics (serviceup, servicedown, etc.)
 */
async function updateHostServiceStats(client, hostId, now) {
  // Count services by status
  const statsResult = await client.query(`
    SELECT 
      COUNT(*) FILTER (WHERE status = 0 AND monitoringstate = 1) as serviceup,
      COUNT(*) FILTER (WHERE status != 0 AND monitoringstate = 1) as servicedown,
      COUNT(*) FILTER (WHERE monitoringmode = 1 AND monitoringstate = 1) as serviceunmonitorauto,
      COUNT(*) FILTER (WHERE monitoringmode = 2 AND monitoringstate = 1) as serviceunmonitormanual
    FROM service
    WHERE hostid = $1
  `, [hostId]);
  
  const stats = statsResult.rows[0];
  
  await client.query(`
    UPDATE host SET
      servicemodified = $1,
      serviceup = $2,
      servicedown = $3,
      serviceunmonitorauto = $4,
      serviceunmonitormanual = $5
    WHERE id = $6
  `, [
    now,
    parseInt(stats.serviceup) || 0,
    parseInt(stats.servicedown) || 0,
    parseInt(stats.serviceunmonitorauto) || 0,
    parseInt(stats.serviceunmonitormanual) || 0,
    hostId
  ]);
}

// Nova função para batch name IDs
async function getOrCreateNameIdsBatch(client, names) {
  const result = await client.query(
    'SELECT id, name FROM name WHERE name = ANY($1::text[])',
    [names]
  );
  
  const map = {};
  const existing = new Set(result.rows.map(r => r.name));
  const toCreate = names.filter(n => !existing.has(n));
  
  // Batch insert novos names
  if (toCreate.length > 0) {
    const values = toCreate.map((name, i) => 
      `($${i*2+1}, $${i*2+2})`
    ).join(',');
    
    const params = toCreate.flatMap(name => {
      const id = generateId();
      map[name] = id;
      return [id, name];
    });
    
    await client.query(`INSERT INTO name (id, name) VALUES ${values}`, params);
  }
  
  // Adicionar existentes ao map
  result.rows.forEach(r => {
    map[r.name] = r.id;
  });
  
  return map;
}

/**
 * Store statistics in batch for multiple services
 */
async function storeStatisticsBatch(client, services) {
  for (const item of services) {
    const serviceId = item.id;
    const service = item.service;
    const collectedSec = item.collectedSec || Math.floor(Date.now() / 1000);
    await storeStatistics(client, serviceId, service, collectedSec);
  }
}

/**
 * Store service statistics
 */
async function storeStatistics(client, serviceId, service, collectedSec) {
  // System statistics (CPU, Memory, Load, Swap)
  if (service.system) {
    if (service.system.cpu) {
      await storeMetric(client, serviceId, 'cpu_user', service.system.cpu.user, collectedSec);
      await storeMetric(client, serviceId, 'cpu_system', service.system.cpu.system, collectedSec);
      await storeMetric(client, serviceId, 'cpu_nice', service.system.cpu.nice, collectedSec);
      await storeMetric(client, serviceId, 'cpu_wait', service.system.cpu.wait, collectedSec);
      await storeMetric(client, serviceId, 'cpu_hardirq', service.system.cpu.hardirq, collectedSec);
      await storeMetric(client, serviceId, 'cpu_softirq', service.system.cpu.softirq, collectedSec);
      await storeMetric(client, serviceId, 'cpu_steal', service.system.cpu.steal, collectedSec);
      await storeMetric(client, serviceId, 'cpu_guest', service.system.cpu.guest, collectedSec);
      await storeMetric(client, serviceId, 'cpu_guestnice', service.system.cpu.guestnice, collectedSec);
    }
    
    if (service.system.memory) {
      await storeMetric(client, serviceId, 'memory_percent', service.system.memory.percent, collectedSec);
      await storeMetric(client, serviceId, 'memory_kilobyte', service.system.memory.kilobyte, collectedSec);
    }
    
    if (service.system.swap) {
      await storeMetric(client, serviceId, 'swap_percent', service.system.swap.percent, collectedSec);
      await storeMetric(client, serviceId, 'swap_kilobyte', service.system.swap.kilobyte, collectedSec);
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
  
  // Port statistics (type 4)
  if (service.port) {
    await storeMetric(client, serviceId, 'port_responsetime', service.port.responsetime, collectedSec);
  }
  
  // File descriptors statistics
  if (service.filedescriptors) {
    await storeMetric(client, serviceId, 'filedescriptors_allocated', service.filedescriptors.allocated, collectedSec);
    await storeMetric(client, serviceId, 'filedescriptors_unused', service.filedescriptors.unused, collectedSec);
    await storeMetric(client, serviceId, 'filedescriptors_maximum', service.filedescriptors.maximum, collectedSec);
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

/**
 * Store service groups
 */
async function storeServiceGroups(client, hostId, serviceGroups, services) {
  // Create a map of service names to service nameIds
  const serviceNameMap = new Map();
  for (const service of services) {
    const serviceNameId = await getOrCreateNameId(client, service.name);
    serviceNameMap.set(service.name, serviceNameId);
  }
  
  for (const group of serviceGroups) {
    const groupNameId = await getOrCreateNameId(client, group.name);
    
    // Check if service group already exists
    const existingGroup = await client.query(
      'SELECT id FROM servicegroup WHERE hostid = $1 AND nameid = $2',
      [hostId, groupNameId]
    );
    
    let groupId;
    if (existingGroup.rows.length > 0) {
      groupId = existingGroup.rows[0].id;
    } else {
      groupId = generateId();
      await client.query(`
        INSERT INTO servicegroup (id, nameid, hostid)
        VALUES ($1, $2, $3)
      `, [groupId, groupNameId, hostId]);
    }
    
    // Remove existing grouped services for this group
    await client.query(
      'DELETE FROM groupedservices WHERE servicegroupid = $1',
      [groupId]
    );
    
    // Add services to group
    for (const serviceName of group.services) {
      const serviceNameId = serviceNameMap.get(serviceName);
      if (serviceNameId) {
        await client.query(`
          INSERT INTO groupedservices (servicegroupid, service_nameid)
          VALUES ($1, $2)
          ON CONFLICT DO NOTHING
        `, [groupId, serviceNameId]);
      }
    }
  }
}

/**
 * Debug function - Store raw XML in tmp_collector table
 */
async function debugStoreXml(client, xmlData) {
  try {
    const id = generateId();
    await client.query(
      'INSERT INTO tmp_collector (id, xml) VALUES ($1, $2)',
      [id, xmlData]
    );
    console.log(`[Debug] XML stored with id: ${id}`);
  } catch (error) {
    console.error('[Debug] Failed to store XML:', error.message);
  }
}
/** FIM DEBUG **/

module.exports = { processMonitData };