const fs = require('fs');
const path = require('path');
const logger = require('./logger');

/**
 * Fixture Validator
 * Ensures all fixture problems have valid sources and structure
 */
class FixtureValidator {
  static validate() {
    logger.info('\n📋 Validating fixture data...');

    const fixturesPath = path.join(__dirname, '../../fixtures');
    const problemsPath = path.join(fixturesPath, 'problems');

    // Check sources.json
    let sources = [];
    try {
      const sourcesData = fs.readFileSync(path.join(fixturesPath, 'sources.json'), 'utf-8');
      sources = JSON.parse(sourcesData);
      logger.info(`✓ Found ${sources.length} fixture sources`);
    } catch (error) {
      logger.error('🔴 Failed to load fixtures/sources.json:', error.message);
      process.exit(1);
    }

    // Check each fixture problem
    let validCount = 0;
    const errors = [];

    try {
      const files = fs.readdirSync(problemsPath)
        .filter(f => f.endsWith('.json'))
        .sort();

      for (const file of files) {
        try {
          const problemData = JSON.parse(
            fs.readFileSync(path.join(problemsPath, file), 'utf-8')
          );

          // Validate required fields
          const required = ['source_id', 'source_url', 'original_text', 'question', 'expected_metadata'];
          for (const field of required) {
            if (!problemData[field]) {
              errors.push(`${file}: missing field '${field}'`);
              continue;
            }
          }

          // Validate source_url format
          if (problemData.source_url && !problemData.source_url.startsWith('http')) {
            errors.push(`${file}: invalid source_url '${problemData.source_url}'`);
          }

          // Validate expected_metadata
          const metadata = problemData.expected_metadata;
          const metadataRequired = ['grade', 'topic', 'problem_type', 'difficulty'];
          for (const field of metadataRequired) {
            if (!metadata[field]) {
              errors.push(`${file}: missing metadata.${field}`);
            }
          }

          validCount++;
        } catch (error) {
          errors.push(`${file}: JSON parse error - ${error.message}`);
        }
      }

      if (errors.length > 0) {
        logger.error('\n🔴 FIXTURE VALIDATION ERRORS:');
        errors.forEach(err => logger.error(`   - ${err}`));
        process.exit(1);
      }

      logger.info(`✓ All ${validCount} fixture problems are valid`);
      logger.info(`✓ All fixture problems have valid source URLs`);
      logger.info(`✓ All fixture problems have required metadata`);
      return true;
    } catch (error) {
      logger.error('🔴 Fixture validation failed:', error.message);
      process.exit(1);
    }
  }
}

module.exports = FixtureValidator;
