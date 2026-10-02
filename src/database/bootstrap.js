const logger = require('../utils/logger');
const { db } = require('../config/database');
const fs = require('fs');
const path = require('path');

/**
 * Database Bootstrap
 * Initializes PostgreSQL with schema and seed data
 */
class DatabaseBootstrap {
  static async initialize() {
    try {
      logger.info('\n🗄️  Database Bootstrap...');

      // Test connection
      logger.info('[1/3] Testing PostgreSQL connection...');
      try {
        await db.one('SELECT 1');
        logger.info('✓ PostgreSQL connected');
      } catch (error) {
        logger.error('\n🔴 Cannot connect to PostgreSQL');
        logger.error(`   Host: ${process.env.PG_HOST}:${process.env.PG_PORT}`);
        logger.error(`   Database: ${process.env.PG_DATABASE}`);
        logger.error(`   Error: ${error.message}`);
        logger.error('\n   Make sure PostgreSQL is running:');
        logger.error('   $ npm run docker:up');
        process.exit(1);
      }

      // Load and execute schema
      logger.info('[2/3] Loading schema...');
      const schemaPath = path.join(__dirname, '../database/schema.sql');
      const schema = fs.readFileSync(schemaPath, 'utf-8');

      try {
        // Split by ; and execute each statement
        const statements = schema
          .split(';')
          .map(s => s.trim())
          .filter(s => s.length > 0);

        for (const statement of statements) {
          await db.none(statement);
        }
        logger.info('✓ Schema created/updated');
      } catch (error) {
        logger.error('🔴 Schema creation failed:', error.message);
        process.exit(1);
      }

      // Seed initial grades and subjects
      logger.info('[3/3] Seeding curriculum...');
      await this.seedCurriculum();
      logger.info('✓ Curriculum seeded');

      logger.info('\n✅ Database bootstrap complete');
      return true;
    } catch (error) {
      logger.error('🔴 Database bootstrap failed:', error);
      process.exit(1);
    }
  }

  static async seedCurriculum() {
    // Grades
    const grades = [
      { name: '6', level: 6 },
      { name: '7', level: 7 },
      { name: '8', level: 8 },
      { name: '9', level: 9 },
      { name: '10', level: 10 },
      { name: '11', level: 11 },
      { name: '12', level: 12 }
    ];

    for (const grade of grades) {
      await db.none(
        'INSERT INTO grades (name, level) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [grade.name, grade.level]
      );
    }

    // Subjects
    const subjects = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'Tiếng Anh'];
    for (const subject of subjects) {
      await db.none(
        'INSERT INTO subjects (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
        [subject]
      );
    }

    // Grade-Subject relationships
    const gradeIds = await db.manyOrNone('SELECT id FROM grades ORDER BY level');
    const subjectIds = await db.manyOrNone('SELECT id FROM subjects');

    for (const grade of gradeIds) {
      for (const subject of subjectIds) {
        await db.none(
          'INSERT INTO grade_subjects (grade_id, subject_id) VALUES ($1, $2) ON CONFLICT DO NOTHING',
          [grade.id, subject.id]
        );
      }
    }
  }
}

module.exports = DatabaseBootstrap;
