/*
 * POSTGRESQL DATABASE SCHEMA FOR THE M/MONIT DATABASE.
 *
 * To create the database:
 * 1) Create a ui4monit postgres user: createuser -U postgres -P ui4monit
 * 2) Create the ui4monit database: createdb -U postgres -E utf8 -O ui4monit ui4monit
 * 3) Create the schema: psql -U ui4monit ui4monit < ui4monit-schema.postgresql
 */


/* ---------------------------------------------------- M/Monit system table */


CREATE TABLE ui4monit (
  schemaversion INTEGER NOT NULL,
  welcome SMALLINT,
  purgeevents INTEGER,
  purgeanalytics INTEGER,
  skew INTEGER,
  programtimeout INTEGER,
  auditdefaultpasswords INTEGER,
  auditmd5passwords INTEGER,
  checkmonitversion INTEGER,
  checkui4monitversion INTEGER
);


/* -------------------------------------------------------------- Name table */


CREATE TABLE name (
  id BIGINT PRIMARY KEY,
  name CHARACTER VARYING(255) NOT NULL,
  CONSTRAINT name_name_unique UNIQUE (name)
);
CREATE INDEX name_name_index ON name (name);


/* ------------------------------------------------------------- Host tables */


CREATE TABLE host (
  id BIGINT PRIMARY KEY,
  created_at BIGINT,
  updated_at BIGINT,
  incarnation INTEGER,
  status INTEGER NOT NULL,
  nameid BIGINT NOT NULL,
  keepname INTEGER DEFAULT 0,
  monitid CHARACTER VARYING(255) NOT NULL,
  ipaddrin CHARACTER VARYING(255) NOT NULL,
  ipaddrout CHARACTER VARYING(255),
  portin INTEGER,
  portout INTEGER DEFAULT -1,
  uname CHARACTER VARYING(255),
  password CHARACTER VARYING(255),
  sslin SMALLINT,
  sslout SMALLINT DEFAULT -1,
  description TEXT,
  poll INTEGER DEFAULT 0,
  startdelay INTEGER DEFAULT 0,
  controlfilenameid BIGINT NOT NULL,
  statusmodified BIGINT,
  servicemodified BIGINT DEFAULT 0,
  serviceskew INTEGER DEFAULT -1,
  serviceup INTEGER DEFAULT 0,
  servicedown INTEGER DEFAULT 0,
  serviceunmonitorauto INTEGER,
  serviceunmonitormanual INTEGER,
  version CHARACTER VARYING(20),
  platformname CHARACTER VARYING(255),
  platformrelease CHARACTER VARYING(255),
  platformversion CHARACTER VARYING(255),
  platformmachine CHARACTER VARYING(255),
  platformcpu INTEGER DEFAULT 0,
  platformmemory BIGINT DEFAULT 0,
  platformswap BIGINT DEFAULT 0,
  platformuptime BIGINT DEFAULT 0,
  statusheartbeat SMALLINT DEFAULT 1,
  CONSTRAINT host_monitid_unique UNIQUE (monitid),
  CONSTRAINT host_nameid_fk FOREIGN KEY(nameid) REFERENCES name(id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT host_controlfilenameid_fk FOREIGN KEY(controlfilenameid) REFERENCES name(id) MATCH FULL ON DELETE CASCADE
);


CREATE TABLE hostgroup (
  id BIGINT PRIMARY KEY,
  nameid BIGINT NOT NULL,
  CONSTRAINT hostgroup_nameid_fk FOREIGN KEY(nameid) REFERENCES name(id) MATCH FULL ON DELETE CASCADE
);


CREATE TABLE groupedhost (
  groupid BIGINT NOT NULL,
  hostid BIGINT NOT NULL,
  origin INTEGER DEFAULT 0,
  PRIMARY KEY(groupid, hostid),
  CONSTRAINT groupedhost_groupid_fk FOREIGN KEY(groupid) REFERENCES hostgroup(id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT groupedhost_hostid_fk FOREIGN KEY(hostid) REFERENCES host(id) MATCH FULL ON DELETE CASCADE
);


/* ---------------------------------------------------------- Service tables */


CREATE TABLE service (
  id BIGINT PRIMARY KEY,
  created_at BIGINT,
  updated_at BIGINT,
  nameid BIGINT NOT NULL,
  hostid BIGINT NOT NULL,
  type INTEGER NOT NULL,
  status INTEGER NOT NULL,
  statushint INTEGER NOT NULL,
  monitoringstate INTEGER NOT NULL,
  monitoringmode INTEGER NOT NULL,
  onreboot INTEGER NOT NULL,
  statusmodified BIGINT DEFAULT 0,
  everytype INTEGER DEFAULT 0,
  everycyclenumber INTEGER DEFAULT 0,
  everycyclecounter INTEGER DEFAULT 0,
  everycron CHARACTER VARYING(255),
  CONSTRAINT service_hostid_fk FOREIGN KEY(hostid) REFERENCES host(id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT service_nameid_fk FOREIGN KEY (nameid) REFERENCES name (id) MATCH FULL ON DELETE CASCADE
);
CREATE INDEX service_hostid_index ON service(hostid);


CREATE TABLE servicegroup (
  id BIGINT PRIMARY KEY,
  nameid BIGINT NOT NULL,
  hostid BIGINT NOT NULL,
  CONSTRAINT servicegroup_hostid_fk FOREIGN KEY(hostid) REFERENCES host(id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT servicegroup_nameid_fk FOREIGN KEY (nameid) REFERENCES name (id) MATCH FULL ON DELETE CASCADE
);
CREATE INDEX servicegroup_hostid_index ON servicegroup(hostid);


CREATE TABLE groupedservices (
  servicegroupid BIGINT NOT NULL,
  service_nameid BIGINT NOT NULL,
  PRIMARY KEY(servicegroupid, service_nameid),
  CONSTRAINT groupedservices_servicegroupid_fk FOREIGN KEY (servicegroupid) REFERENCES servicegroup (id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT groupedservices_service_nameid_fk FOREIGN KEY (service_nameid) REFERENCES name (id) MATCH FULL ON DELETE CASCADE
);


/* ------------------------------------------------------------ Event tables */


CREATE TABLE event (
  id BIGINT PRIMARY KEY,
  hostid BIGINT NOT NULL,
  serviceid BIGINT NOT NULL,
  collectedsec BIGINT NOT NULL,
  collectedusec BIGINT NOT NULL,
  service_nameid BIGINT NOT NULL,
  servicetype INTEGER NOT NULL,
  event INTEGER NOT NULL,
  state INTEGER NOT NULL,
  action INTEGER NOT NULL,
  message TEXT NOT NULL,
  hasnotice INTEGER,
  active INTEGER,
  CONSTRAINT event_hostid_fk FOREIGN KEY (hostid) REFERENCES host (id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT event_serviceid_fk FOREIGN KEY (serviceid) REFERENCES service (id) MATCH FULL ON DELETE CASCADE,
  CONSTRAINT event_service_nameid_fk FOREIGN KEY (service_nameid) REFERENCES name (id) MATCH FULL ON DELETE CASCADE
);
CREATE INDEX event_hostid_index ON event (hostid);
CREATE INDEX event_serviceid_index ON event (serviceid);
CREATE INDEX event_collectedsec_collectedusec_index ON event(collectedsec, collectedusec);
CREATE INDEX event_service_nameid_index ON event(service_nameid);
CREATE INDEX event_servicetype_index ON event (servicetype);
CREATE INDEX event_state_index ON event (state);
CREATE INDEX event_event_index ON event (event);
CREATE INDEX event_active_index ON event (active);


/* ------------------------------------------------------- Statistics tables */


CREATE TABLE statistics (
  id BIGINT PRIMARY KEY,
  serviceid BIGINT NOT NULL,
  type INTEGER NOT NULL,
  datatype INTEGER NOT NULL,
  descriptor CHARACTER VARYING(255),
  CONSTRAINT statistics_serviceid_fk FOREIGN KEY(serviceid) REFERENCES service(id) MATCH FULL ON DELETE CASCADE
);
CREATE INDEX statistics_serviceid_type_index ON statistics(serviceid, type);


CREATE TABLE statistics_double (
  statisticsid BIGINT,
  collectedsec BIGINT NOT NULL,
  value DOUBLE PRECISION,
  CONSTRAINT statistics_double_statisticsid_fk FOREIGN KEY(statisticsid) REFERENCES statistics(id) MATCH FULL ON DELETE CASCADE
);
CREATE INDEX statistics_double_statisticsid_collectedsec_index ON statistics_double(statisticsid, collectedsec);


/* ------------------------------------------------------------ Initial Data */


INSERT INTO ui4monit (schemaversion, welcome, purgeevents, purgeanalytics, skew, programtimeout, auditdefaultpasswords, auditmd5passwords, checkmonitversion, checkui4monitversion) VALUES (26, 1, 11, 10, 3, 300, 1, 1, 0, 0);


/* ------------------------------------------------------------ Procedures */


/**
 * Check and mark offline hosts based on timeout
 * 
 * A host is considered offline if it hasn't sent data for more than
 * 2x its poll interval (default timeout multiplier).
 * 
 * @param timeout_multiplier - Multiplier for poll interval (default: 2)
 * @returns Number of hosts marked as offline
 */
CREATE OR REPLACE FUNCTION check_offline_hosts(timeout_multiplier INTEGER DEFAULT 2)
RETURNS INTEGER AS $$
DECLARE
  current_time BIGINT;
  affected_count INTEGER;
BEGIN
  -- Get current Unix timestamp
  current_time := EXTRACT(EPOCH FROM NOW())::BIGINT;
  
  -- Update hosts that haven't sent data within timeout period
  -- Only update hosts that are currently marked as online (status = 1)
  UPDATE host
  SET 
    status = 0,
    statusheartbeat = 0,
    statusmodified = current_time
  WHERE 
    status = 1
    AND updated_at IS NOT NULL
    AND poll > 0
    AND (current_time - updated_at) > (poll * timeout_multiplier);
  
  GET DIAGNOSTICS affected_count = ROW_COUNT;
  
  RETURN affected_count;
END;
$$ LANGUAGE plpgsql;





