const xml2js = require('xml2js');

/**
 * Parse Monit XML payload
 */
async function parseMonitXml(xmlString) {
  const parser = new xml2js.Parser({
    explicitArray: false,
    mergeAttrs: true,
    valueProcessors: [xml2js.processors.parseNumbers]
  });
  
  try {
    const result = await parser.parseStringPromise(xmlString);
    return result.monit;
  } catch (error) {
    throw new Error(`XML parsing error: ${error.message}`);
  }
}

/**
 * Extract host information from parsed XML
 */
function extractHostInfo(monitData) {
  const server = monitData.server || {};
  const platform = monitData.platform || {};
  const credentials = server.credentials || {};
  
  return {
    localhostname: server.localhostname || 'unknown',
    incarnation: monitData.incarnation || server.incarnation || 0,
    monitId: monitData.id || server.id || `${server.localhostname}-${Date.now()}`,
    controlfile: server.controlfile || '',
    httpd: {
      address: server.httpd?.address || '0.0.0.0',
      port: server.httpd?.port || 2812,
      ssl: server.httpd?.ssl === 1 || server.httpd?.ssl === 'true'
    },
    credentials: {
      username: credentials.username || '',
      password: credentials.password || ''
    },
    poll: server.poll || 120,
    startdelay: server.startdelay || 0,
    uptime: server.uptime || 0,
    version: monitData.version || server.version || '',
    platform: {
      name: platform.name || '',
      release: platform.release || '',
      version: platform.version || '',
      machine: platform.machine || '',
      cpu: platform.cpu || 0,
      memory: platform.memory || 0,
      swap: platform.swap || 0
    }
  };
}

/**
 * Extract services from parsed XML
 */
function extractServices(monitData) {
  let services = monitData.service || [];
  
  // Ensure services is always an array
  if (!Array.isArray(services)) {
    services = [services];
  }
  
  return services.map(service => ({
    name: service.name || 'unknown',
    type: service.type || 0,
    status: service.status || 0,
    statusHint: service.status_hint || 0,
    monitoringState: service.monitor || 0,
    monitoringMode: service.monitormode || 0,
    onReboot: service.onreboot || 0,
    pendingAction: service.pendingaction || 0,
    collectedSec: service.collected_sec || Math.floor(Date.now() / 1000),
    collectedUsec: service.collected_usec || 0,
    // System service metrics
    system: service.system ? {
      load: service.system.load || {},
      cpu: service.system.cpu ? {
        user: service.system.cpu.user || 0,
        system: service.system.cpu.system || 0,
        nice: service.system.cpu.nice || 0,
        wait: service.system.cpu.wait || 0,
        hardirq: service.system.cpu.hardirq || 0,
        softirq: service.system.cpu.softirq || 0,
        steal: service.system.cpu.steal || 0,
        guest: service.system.cpu.guest || 0,
        guestnice: service.system.cpu.guestnice || 0
      } : {},
      memory: service.system.memory || {},
      swap: service.system.swap ? {
        percent: service.system.swap.percent || 0,
        kilobyte: service.system.swap.kilobyte || 0
      } : {}
    } : null,
    // Process metrics
    process: service.process ? {
      pid: service.process.pid,
      ppid: service.process.ppid,
      uptime: service.process.uptime,
      children: service.process.children,
      memory: service.process.memory || {},
      cpu: service.cpu || {}
    } : null,
    // Filesystem metrics
    filesystem: service.block ? {
      percent: service.block.percent,
      usage: service.block.usage,
      total: service.block.total
    } : null,
    // Port metrics (type 4)
    port: service.port ? {
      hostname: service.port.hostname || '',
      portnumber: service.port.portnumber || 0,
      request: service.port.request || '',
      protocol: service.port.protocol || '',
      type: service.port.type || '',
      responsetime: service.port.responsetime || 0
    } : null,
    // File descriptors
    filedescriptors: service.filedescriptors ? {
      allocated: service.filedescriptors.allocated || 0,
      unused: service.filedescriptors.unused || 0,
      maximum: service.filedescriptors.maximum || 0
    } : null,
    // Program metrics
    program: service.program ? {
      status: service.program.status,
      started: service.program.started,
      output: service.program.output
    } : null
  }));
}

/**
 * Extract events from parsed XML
 */
function extractEvents(monitData) {
  let events = monitData.event || [];
  
  if (!Array.isArray(events)) {
    events = events ? [events] : [];
  }
  
  return events.map(event => ({
    service: event.service || 'unknown',
    type: event.type || 0,
    id: event.id || 0,
    state: event.state || 0,
    action: event.action || 0,
    message: event.message || '',
    collected: {
      sec: event.collected_sec || Math.floor(Date.now() / 1000),
      usec: event.collected_usec || 0
    }
  }));
}

/**
 * Extract service groups from parsed XML
 */
function extractServiceGroups(monitData) {
  // Handle both servicegroups (plural) and servicegroup (singular) from xml2js
  const serviceGroupsData = monitData.servicegroups || monitData.servicegroup;
  if (!serviceGroupsData) {
    return [];
  }
  
  let serviceGroups = serviceGroupsData.servicegroup || serviceGroupsData;
  
  if (!Array.isArray(serviceGroups)) {
    serviceGroups = serviceGroups ? [serviceGroups] : [];
  }
  
  return serviceGroups.map(group => {
    const serviceList = group.service || [];
    return {
      name: group.name || 'unknown',
      services: Array.isArray(serviceList) ? serviceList : (serviceList ? [serviceList] : [])
    };
  });
}

module.exports = {
  parseMonitXml,
  extractHostInfo,
  extractServices,
  extractEvents,
  extractServiceGroups
};
