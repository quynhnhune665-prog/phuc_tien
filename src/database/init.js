const fs = require('fs');
const path = require('path');
const { db, pgp } = require('../config/database');
const logger = require('../utils/logger');

async function initDatabase() {
  try {
    logger.info('Initializing database...');
    
    const schemaPath = path.join(__dirname, 'schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    
    await db.none(schema);
    logger.info('✓ Database schema created successfully');
    
    // Seed initial grades and subjects
    await seedGradesAndSubjects();
    
    logger.info('✓ Database initialization complete');
    process.exit(0);
  } catch (error) {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  }
}

async function seedGradesAndSubjects() {
  const grades = [
    { name: '6', level: 6 },
    { name: '7', level: 7 },
    { name: '8', level: 8 },
    { name: '9', level: 9 },
    { name: '10', level: 10 },
    { name: '11', level: 11 },
    { name: '12', level: 12 }
  ];
  
  const subjects = ['Toán', 'Lý', 'Hóa', 'Sinh', 'Sử', 'Địa', 'Tiếng Anh'];
  
  for (const grade of grades) {
    await db.none(
      'INSERT INTO grades (name, level) VALUES ($1, $2) ON CONFLICT DO NOTHING',
      [grade.name, grade.level]
    );
  }
  
  for (const subject of subjects) {
    await db.none(
      'INSERT INTO subjects (name) VALUES ($1) ON CONFLICT DO NOTHING',
      [subject]
    );
  }
  
  // Create grade-subject relationships
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
  
  logger.info('✓ Initial grades and subjects seeded');
}

if (require.main === module) {
  initDatabase();
}

module.exports = { initDatabase };
