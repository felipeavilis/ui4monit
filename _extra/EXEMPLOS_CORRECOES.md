# 🔧 Exemplos de Correções Críticas

Este documento contém exemplos práticos de código para implementar as correções mais críticas identificadas na análise.

> **Nota**: Se a aplicação estiver atrás de um gateway, autenticação, rate limiting e CORS podem ser tratados no gateway (baixa prioridade na aplicação).

---

## 1. ⚡ Correção do Problema N+1 Queries (PRIORIDADE MÁXIMA)

### Problema
Loops com queries individuais causam lentidão extrema com muitos serviços/eventos.

### Solução: Batch Operations

**ANTES (lento - N+1 queries):**
```javascript
async function updateServices(client, hostId, services) {
  const now = Math.floor(Date.now() / 1000);
  
  for (const service of services) {
    const serviceNameId = await getOrCreateNameId(client, service.name);
    // ... query individual para cada serviço
  }
}
```

**DEPOIS (otimizado - batch operations):**
```javascript
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
  
  // Batch statistics
  await storeStatisticsBatch(client, toInsert.concat(toUpdate), now);
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
```

---

## 2. ✅ Validação de Inputs XML (PRIORIDADE ALTA)

### Problema
XML recebido sem validação adequada pode causar erros ou ataques.

### Solução

**backend/src/middleware/xmlValidation.js**
```javascript
const { parseStringPromise } = require('xml2js');

const validateMonitXml = async (req, res, next) => {
  try {
    const xmlData = req.body;
    
    // Validar tamanho (limite de 10MB já configurado no express.text)
    if (!xmlData || xmlData.length === 0) {
      return res.status(400).json({ error: 'Empty XML body' });
    }
    
    if (xmlData.length > 10 * 1024 * 1024) {
      return res.status(413).json({ error: 'XML too large' });
    }
    
    // Tentar parsear para validar estrutura básica
    const parser = require('xml2js').Parser({
      explicitArray: false,
      mergeAttrs: true,
      // Desabilitar entidades externas para prevenir XXE
      xmldec: { version: '1.0', encoding: 'UTF-8' },
      trim: true
    });
    
    const parsed = await parser.parseStringPromise(xmlData);
    
    // Validar estrutura mínima esperada
    if (!parsed.monit || !parsed.monit.server) {
      return res.status(400).json({ error: 'Invalid Monit XML structure' });
    }
    
    // Validar campos obrigatórios
    if (!parsed.monit.server.localhostname) {
      return res.status(400).json({ error: 'Missing localhostname' });
    }
    
    // Armazenar XML parseado para evitar re-parse
    req.parsedXml = parsed;
    next();
  } catch (error) {
    return res.status(400).json({ 
      error: 'Invalid XML',
      message: error.message 
    });
  }
};

module.exports = { validateMonitXml };
```

**backend/src/routes/collector.js**
```javascript
const { validateMonitXml } = require('../middleware/xmlValidation');

router.post('/', validateMonitXml, async (req, res) => {
  // req.parsedXml já está disponível, pode usar diretamente
  const monitData = req.parsedXml.monit;
  // ... resto do código
});
```

---

## 3. 📝 Implementação do Winston (PRIORIDADE ALTA)

### Problema
Sem proteção contra abuso do endpoint.

### Solução

**backend/src/middleware/rateLimit.js**
```javascript
const rateLimit = require('express-rate-limit');

// Rate limit para collector (mais restritivo)
const collectorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requisições por IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para API (menos restritivo)
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many API requests, please try again later.',
});

module.exports = { collectorRateLimit, apiRateLimit };
```

**backend/src/server.js**
```javascript
const { collectorRateLimit, apiRateLimit } = require('./middleware/rateLimit');

// Aplicar rate limiting
app.use('/collector', collectorRateLimit);
app.use('/api', apiRateLimit);
```

**package.json** - Adicionar dependência:
```json
{
  "dependencies": {
    "express-rate-limit": "^7.1.5",
    "express-basic-auth": "^1.7.1"
  }
}
```

---

## 3. ⚡ Correção do Problema N+1 Queries

### Problema
Loops com queries individuais causam lentidão.

### Solução: Batch Operations

**backend/src/services/collectorService.js**

**ANTES (lento):**
```javascript
async function updateServices(client, hostId, services) {
  const now = Math.floor(Date.now() / 1000);
  
  for (const service of services) {
    const serviceNameId = await getOrCreateNameId(client, service.name);
    // ... query individual para cada serviço
  }
}
```

**DEPOIS (otimizado):**
```javascript
async function updateServices(client, hostId, services) {
  const now = Math.floor(Date.now() / 1000);
  
  // Batch: criar todos os nameIds de uma vez
  const serviceNames = services.map(s => s.name);
  const nameIdMap = await getOrCreateNameIdsBatch(client, serviceNames);
  
  // Preparar dados para batch insert/update
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
      toUpdate.push({
        id: existingId,
        serviceNameId,
        service
      });
    } else {
      toInsert.push({
        id: generateId(),
        serviceNameId,
        service
      });
    }
  }
  
  // Batch update
  if (toUpdate.length > 0) {
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
      WHERE id = ANY($9::bigint[])
    `, [
      now,
      // ... valores em arrays
    ]);
  }
  
  // Batch insert usando unnest ou VALUES
  if (toInsert.length > 0) {
    const values = toInsert.map(s => 
      `(${s.id}, ${now}, ${now}, ${s.serviceNameId}, ${hostId}, ...)`
    ).join(',');
    
    await client.query(`
      INSERT INTO service (...) VALUES ${values}
    `);
  }
  
  // Batch statistics
  await storeStatisticsBatch(client, toInsert.concat(toUpdate), now);
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
    const values = toCreate.map(name => {
      const id = generateId();
      map[name] = id;
      return `(${id}, '${name.replace(/'/g, "''")}')`;
    }).join(',');
    
    await client.query(`INSERT INTO name (id, name) VALUES ${values}`);
  }
  
  // Adicionar existentes ao map
  result.rows.forEach(r => {
    map[r.name] = r.id;
  });
  
  return map;
}
```

---

## 4. 📝 Implementação do Winston

### Problema
Winston instalado mas não usado, logs não estruturados.

### Solução

**backend/src/config/logger.js**
```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'ui4monit-backend' },
  transports: [
    new winston.transports.File({ 
      filename: 'logs/error.log', 
      level: 'error' 
    }),
    new winston.transports.File({ 
      filename: 'logs/combined.log' 
    }),
  ],
});

// Em desenvolvimento, também logar no console
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

module.exports = logger;
```

**backend/src/routes/collector.js**
```javascript
const logger = require('../config/logger'); // ADICIONAR

router.post('/', async (req, res) => {
  try {
    const xmlData = req.body;
    const sourceIp = req.ip || req.connection.remoteAddress;
    
    logger.info('Collector request received', { 
      ip: sourceIp,
      contentLength: xmlData.length 
    });
    
    const result = await processMonitData(xmlData, sourceIp);
    
    logger.info('Monit data processed', {
      hostname: result.hostname,
      servicesCount: result.servicesCount,
      eventsCount: result.eventsCount
    });
    
    res.status(200).send('OK');
  } catch (error) {
    logger.error('Collector error', {
      error: error.message,
      stack: error.stack,
      ip: req.ip
    });
    res.status(500).send('Internal Server Error');
  }
});
```

---

## 5. ✅ Validação de Inputs

### Problema
Dados não validados podem causar erros inesperados.

### Solução: Joi

**backend/src/middleware/validation.js**
```javascript
const Joi = require('joi');

const validateQuery = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.query);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }
    next();
  };
};

const validateParams = (schema) => {
  return (req, res, next) => {
    const { error } = schema.validate(req.params);
    if (error) {
      return res.status(400).json({ 
        error: 'Validation error',
        details: error.details.map(d => d.message)
      });
    }
    next();
  };
};

module.exports = { validateQuery, validateParams };
```

**backend/src/routes/api.js**
```javascript
const Joi = require('joi');
const { validateQuery, validateParams } = require('../middleware/validation');

// Schema de validação
const hostIdSchema = Joi.object({
  id: Joi.string().pattern(/^\d+$/).required()
});

const eventsQuerySchema = Joi.object({
  hostid: Joi.string().pattern(/^\d+$/).optional(),
  limit: Joi.number().integer().min(1).max(1000).default(100)
});

// Aplicar validação
router.get('/hosts/:id', 
  validateParams(hostIdSchema),
  async (req, res) => {
    // ... código existente
  }
);

router.get('/events',
  validateQuery(eventsQuerySchema),
  async (req, res) => {
    // ... código existente
  }
);
```

**package.json**
```json
{
  "dependencies": {
    "joi": "^17.11.0"
  }
}
```

---

## 6. 🌍 Correção da Extração de IP

### Problema
`req.ip` não funciona sem `trust proxy`.

### Solução

**backend/src/server.js**
```javascript
// ADICIONAR antes das rotas
app.set('trust proxy', true); // Confiar no primeiro proxy

// OU mais específico:
app.set('trust proxy', 1); // Confiar apenas no primeiro proxy

// OU para múltiplos proxies:
app.set('trust proxy', ['127.0.0.1', '::1']); // IPs específicos
```

**backend/src/routes/collector.js**
```javascript
// Melhorar extração de IP
const getClientIp = (req) => {
  return req.ip || 
         req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         'unknown';
};

router.post('/', async (req, res) => {
  const sourceIp = getClientIp(req);
  // ... resto do código
});
```

---

## 7. 🔢 Geração de ID Confiável

### Problema
`generateId()` pode gerar colisões.

### Solução: UUID ou Sequência PostgreSQL

**Opção 1: UUID (Node.js)**
```javascript
// backend/src/config/database.js
const { v4: uuidv4 } = require('uuid');

const generateId = () => {
  // Converter UUID para número (se necessário manter compatibilidade)
  // OU usar UUID diretamente no banco (tipo uuid)
  return uuidv4();
};
```

**Opção 2: Sequência PostgreSQL (Recomendado)**
```sql
-- database/schema.sql
CREATE SEQUENCE id_sequence START 1;

-- Usar em inserts:
INSERT INTO host (id, ...) VALUES (nextval('id_sequence'), ...);
```

**Opção 3: Snowflake ID (Melhor para alta concorrência)**
```javascript
// backend/src/config/database.js
const generateId = () => {
  const timestamp = Date.now();
  const machineId = parseInt(process.env.MACHINE_ID || '1');
  const sequence = Math.floor(Math.random() * 4096);
  
  // Snowflake-like ID: timestamp (41 bits) + machine (10 bits) + sequence (12 bits)
  return (timestamp << 22) | (machineId << 12) | sequence;
};
```

---

## 8. 🗑️ Purga Automática de Dados

### Problema
`statistics_double` cresce indefinidamente.

### Solução: Job de Purga

**backend/src/services/purgeService.js**
```javascript
const { pool } = require('../config/database');
const logger = require('../config/logger');

async function purgeOldStatistics(daysToKeep = 30) {
  const cutoffDate = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  
  try {
    const result = await pool.query(`
      DELETE FROM statistics_double
      WHERE collectedsec < $1
    `, [cutoffDate]);
    
    logger.info('Purged old statistics', {
      rowsDeleted: result.rowCount,
      cutoffDate: new Date(cutoffDate * 1000).toISOString()
    });
    
    return result.rowCount;
  } catch (error) {
    logger.error('Error purging statistics', { error: error.message });
    throw error;
  }
}

async function purgeOldEvents(daysToKeep = 90) {
  const cutoffDate = Math.floor(Date.now() / 1000) - (daysToKeep * 24 * 60 * 60);
  
  try {
    const result = await pool.query(`
      DELETE FROM event
      WHERE collectedsec < $1 AND active = 0
    `, [cutoffDate]);
    
    logger.info('Purged old events', {
      rowsDeleted: result.rowCount,
      cutoffDate: new Date(cutoffDate * 1000).toISOString()
    });
    
    return result.rowCount;
  } catch (error) {
    logger.error('Error purging events', { error: error.message });
    throw error;
  }
}

// Executar diariamente
function startPurgeJob() {
  const interval = 24 * 60 * 60 * 1000; // 24 horas
  
  setInterval(async () => {
    try {
      await purgeOldStatistics(parseInt(process.env.STATS_RETENTION_DAYS || '30'));
      await purgeOldEvents(parseInt(process.env.EVENTS_RETENTION_DAYS || '90'));
    } catch (error) {
      logger.error('Purge job failed', { error: error.message });
    }
  }, interval);
  
  logger.info('Purge job started');
}

module.exports = { purgeOldStatistics, purgeOldEvents, startPurgeJob };
```

**backend/src/server.js**
```javascript
const { startPurgeJob } = require('./services/purgeService');

// Iniciar job de purga
startPurgeJob();
```

---

## 9. 🌐 CORS Configurado Corretamente ⚠️ BAIXA PRIORIDADE (se gateway)

### Problema
CORS aberto para qualquer origem.

### Solução

> **Nota**: Se usando gateway, configurar CORS lá.

**backend/src/server.js**
```javascript
const cors = require('cors');

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'];
    
    // Permitir requisições sem origin (mobile apps, Postman, etc)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.indexOf(origin) !== -1 || process.env.NODE_ENV === 'development') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

app.use(cors(corsOptions));
```

---

## 10. 🛡️ Rate Limiting ⚠️ BAIXA PRIORIDADE (se gateway)

### Problema
Sem proteção contra abuso do endpoint.

### Solução

**backend/src/middleware/rateLimit.js**
```javascript
const rateLimit = require('express-rate-limit');

// Rate limit para collector (mais restritivo)
const collectorRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requisições por IP
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false,
});

// Rate limit para API (menos restritivo)
const apiRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 1000,
  message: 'Too many API requests, please try again later.',
});

module.exports = { collectorRateLimit, apiRateLimit };
```

**backend/src/server.js**
```javascript
const { collectorRateLimit, apiRateLimit } = require('./middleware/rateLimit');

// Aplicar rate limiting (se não estiver no gateway)
app.use('/collector', collectorRateLimit);
app.use('/api', apiRateLimit);
```

**package.json** - Adicionar dependência:
```json
{
  "dependencies": {
    "express-rate-limit": "^7.1.5"
  }
}
```

> **Nota**: Se usando gateway, configurar rate limiting lá.

---

## 11. 🔒 Autenticação no Endpoint `/collector` ⚠️ BAIXA PRIORIDADE (se gateway)

### Problema
Endpoint completamente aberto, qualquer pessoa pode enviar dados.

### Solução: Autenticação Básica

> **Nota**: Se usando gateway, configurar autenticação lá.

**backend/src/middleware/auth.js**
```javascript
const basicAuth = require('express-basic-auth');

// Middleware para autenticação básica no collector
const collectorAuth = basicAuth({
  users: { 
    [process.env.COLLECTOR_USER || 'monit']: process.env.COLLECTOR_PASSWORD || 'monit'
  },
  challenge: true,
  realm: 'UI4Monit Collector'
});

module.exports = { collectorAuth };
```

**backend/src/routes/collector.js**
```javascript
const express = require('express');
const router = express.Router();
const { processMonitData } = require('../services/collectorService');
const { collectorAuth } = require('../middleware/auth'); // ADICIONAR

router.post('/', collectorAuth, async (req, res) => { // ADICIONAR middleware
  // ... resto do código
});
```

**Alternativa: Token-based (mais seguro)**
```javascript
// backend/src/middleware/auth.js
const validateToken = (req, res, next) => {
  const token = req.headers['x-collector-token'] || req.query.token;
  
  if (!token || token !== process.env.COLLECTOR_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  next();
};

module.exports = { validateToken };
```

**package.json** - Adicionar dependência:
```json
{
  "dependencies": {
    "express-basic-auth": "^1.7.1"
  }
}
```

---

## 12. 🧪 Estrutura Básica de Testes (PRIORIDADE ALTA)

### Problema
Zero testes.

### Solução: Jest + Supertest

**backend/tests/collector.test.js**
```javascript
const request = require('supertest');
const app = require('../src/server');
const { pool } = require('../src/config/database');

describe('POST /collector', () => {
  beforeEach(async () => {
    // Limpar dados de teste
    await pool.query('DELETE FROM event');
    await pool.query('DELETE FROM service');
    await pool.query('DELETE FROM host');
  });
  
  it('should accept valid Monit XML', async () => {
    const xml = `<?xml version="1.0"?><monit><server><localhostname>test</localhostname></server></monit>`;
    
    const response = await request(app)
      .post('/collector')
      .set('Content-Type', 'text/xml')
      .send(xml);
    
    expect(response.status).toBe(200);
  });
  
  it('should accept valid Monit XML', async () => {
    const xml = `<?xml version="1.0"?><monit><server><localhostname>test</localhostname></server></monit>`;
    
    const response = await request(app)
      .post('/collector')
      .auth('monit', 'monit')
      .set('Content-Type', 'text/xml')
      .send(xml);
    
    expect(response.status).toBe(200);
  });
});
```

**package.json**
```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:coverage": "jest --coverage"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

---

## 📦 Dependências Adicionais Necessárias

```json
{
  "dependencies": {
    "express-rate-limit": "^7.1.5",
    "express-basic-auth": "^1.7.1",
    "joi": "^17.11.0",
    "helmet": "^7.1.0"
  },
  "devDependencies": {
    "jest": "^29.7.0",
    "supertest": "^6.3.3"
  }
}
```

---

## 🚀 Ordem de Implementação Recomendada

> **Assumindo gateway para autenticação/rate limiting/CORS**

### Prioridade Máxima (Esta Semana)
1. **N+1 Fix** (4h) - Performance crítica
2. **Trust Proxy** (5 min) - IP correto
3. **Validação XML** (2h) - Segurança de dados
4. **ID Generation** (1h) - Confiabilidade

### Prioridade Alta (Próximas 2 Semanas)
5. **Winston** (30 min) - Logging estruturado
6. **Purga de Dados** (2h) - Manutenção
7. **Validação API** (2h) - Qualidade
8. **Testes Básicos** (1 dia) - Confiança

### Baixa Prioridade (Se não no gateway)
9. **Autenticação** (1h) - Se não no gateway
10. **Rate Limiting** (15 min) - Se não no gateway
11. **CORS** (10 min) - Se não no gateway

---

*Documento criado para facilitar implementação das correções críticas*

