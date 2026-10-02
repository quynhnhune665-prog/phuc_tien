const pgp = require('pg-promise')();
const config = {
  host: process.env.PG_HOST || 'localhost',
  port: process.env.PG_PORT || 5432,
  database: process.env.PG_DATABASE || 'phuc_tien_dev',
  user: process.env.PG_USER || 'postgres',
  password: process.env.PG_PASSWORD || 'postgres',
  ssl: process.env.PG_SSL === 'true'
};

const db = pgp(config);

module.exports = {
  db,
  pgp,
  config
};
