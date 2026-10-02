const logger = require('./logger');

/**
 * Environment Validator
 * Ensures all required env vars are set and valid
 */
class EnvValidator {
  static validate() {
    const required = [
      'PG_HOST',
      'PG_PORT',
      'PG_DATABASE',
      'PG_USER',
      'PG_PASSWORD',
      'NODE_ENV',
      'PORT'
    ];

    const missing = [];
    const invalid = [];

    for (const key of required) {
      const value = process.env[key];
      if (!value) {
        missing.push(key);
      }
    }

    if (missing.length > 0) {
      logger.error('\n🔴 MISSING REQUIRED ENV VARIABLES:');
      missing.forEach(key => logger.error(`   - ${key}`));
      logger.error('\n   Create .env file from .env.example and set all variables.');
      process.exit(1);
    }

    // Validate port
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      invalid.push(`PORT must be 1-65535, got ${process.env.PORT}`);
    }

    // Validate PostgreSQL port
    const pgPort = parseInt(process.env.PG_PORT);
    if (isNaN(pgPort) || pgPort < 1 || pgPort > 65535) {
      invalid.push(`PG_PORT must be 1-65535, got ${process.env.PG_PORT}`);
    }

    if (invalid.length > 0) {
      logger.error('\n🔴 INVALID ENV VARIABLES:');
      invalid.forEach(msg => logger.error(`   - ${msg}`));
      process.exit(1);
    }

    logger.info('✅ Environment validation passed');
    return true;
  }
}

module.exports = EnvValidator;
