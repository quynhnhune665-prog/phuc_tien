const pgp = require('pg-promise')();
const { Client } = require('pg');

const config = {
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'phuc_tien_dev',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  ssl: process.env.PG_SSL === 'true'
};

async function ensureDatabaseExists() {
  const defaultClient = new Client({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: 'postgres',
    ssl: config.ssl
  });

  try {
    await defaultClient.connect();
    const res = await defaultClient.query(
      'SELECT 1 FROM pg_database WHERE datname = $1',
      [config.database]
    );

    if (res.rowCount === 0) {
      await defaultClient.query(`CREATE DATABASE "${config.database}"`);
      console.log(`[DB] Created database: ${config.database}`);
    } else {
      console.log(`[DB] Database exists: ${config.database}`);
    }
  } catch (error) {
    console.error('[DB] Failed to ensure database exists:', error.message);
    throw error;
  } finally {
    await defaultClient.end();
  }
}

(async () => {
  try {
    await ensureDatabaseExists();
  } catch (error) {
    console.error('[DB] Database bootstrap failed. Ensure PostgreSQL is running and credentials are valid.');
    process.exit(1);
  }
})();

const db = pgp(config);

module.exports = {
  db,
  pgp,
  config,
  ensureDatabaseExists
};
