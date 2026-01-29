const { Pool } = require('pg');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  user: process.env.DB_USER || 'ui4monit',
  password: process.env.DB_PASSWORD || 'ui4monit',
  database: process.env.DB_NAME || 'ui4monit',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

pool.on('error', (err) => {
  console.error('Unexpected error on idle client', err);
  process.exit(-1);
});

// ID generator using bigint timestamps
const generateId = () => {
  return Date.now() * 1000 + Math.floor(Math.random() * 1000);
};

// Get or create name ID
const getOrCreateNameId = async (client, name) => {
  const result = await client.query(
    'SELECT id FROM name WHERE name = $1',
    [name]
  );
  
  if (result.rows.length > 0) {
    return result.rows[0].id;
  }
  
  const id = generateId();
  await client.query(
    'INSERT INTO name (id, name) VALUES ($1, $2)',
    [id, name]
  );
  
  return id;
};

module.exports = { pool, generateId, getOrCreateNameId };
