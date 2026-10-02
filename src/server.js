const express = require('express');
const config = require('./config/env');
const logger = require('./utils/logger');
const { db } = require('./config/database');

const app = express();

app.use(express.json());

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// DB check
app.get('/db-health', async (req, res) => {
  try {
    await db.one('SELECT 1');
    res.json({ status: 'connected', database: config.node_env });
  } catch (error) {
    res.status(500).json({ status: 'disconnected', error: error.message });
  }
});

// API Routes (to be added)
// app.use('/api/hunt', require('./api/routes/hunt'));
// app.use('/api/problems', require('./api/routes/problems'));

// Error handler
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: err.message });
});

const PORT = config.port;
app.listen(PORT, () => {
  logger.info(`✓ PTIEN Math Hunter server running on port ${PORT}`);
  logger.info(`  Environment: ${config.node_env}`);
  logger.info(`  Search Provider: ${config.search_provider}`);
});

module.exports = app;
