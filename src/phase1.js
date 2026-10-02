#!/usr/bin/env node

require('dotenv').config();

const logger = require('./utils/logger');
const { db } = require('./config/database');
const { initDatabase } = require('./database/init');
const SearchEngine = require('./search/search-engine');
const CandidateExtractor = require('./extraction/candidate-extractor');
const Classifier = require('./classification/classifier');
const DedupEngine = require('./dedup/dedup-engine');
const ReviewQueue = require('./review/review-queue');
const ProblemRepository = require('./repository/problem-repository');
const WorkbookGenerator = require('./workbook/workbook-generator');
const Phase1Pipeline = require('./pipeline/phase1-orchestrator');

async function runPhase1() {
  try {
    logger.info('Phase 1 Initialization...');

    // Initialize database
    logger.info('[1/7] Database setup...');
    const schemaPath = require('path').join(__dirname, 'database', 'schema.sql');
    const fs = require('fs');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await db.none(schema);
    logger.info('✓ Database schema ready');

    // Get or create grade 8
    const grade = await db.oneOrNone('SELECT id FROM grades WHERE level = $1', [8]);
    const gradeId = grade ? grade.id : (await db.one('INSERT INTO grades (name, level) VALUES ($1, $2) RETURNING id', ['8', 8])).id;

    // Get or create topic
    const subject = await db.oneOrNone('SELECT id FROM subjects WHERE name = $1', ['Toán']);
    const subjectId = subject ? subject.id : (await db.one('INSERT INTO subjects (name) VALUES ($1) RETURNING id', ['Toán'])).id;

    const chapter = await db.oneOrNone('SELECT id FROM chapters WHERE name = $1 AND subject_id = $2', ['Hình học', subjectId]);
    const chapterId = chapter ? chapter.id : (await db.one('INSERT INTO chapters (name, subject_id) VALUES ($1, $2) RETURNING id', ['Hình học', subjectId])).id;

    const topic = await db.oneOrNone('SELECT id FROM topics WHERE name = $1 AND chapter_id = $2', ['Hình bình hành', chapterId]);
    const topicId = topic ? topic.id : (await db.one('INSERT INTO topics (name, chapter_id) VALUES ($1, $2) RETURNING id', ['Hình bình hành', chapterId])).id;

    logger.info('✓ Database initialized');

    // Initialize components
    logger.info('[2/7] Initializing components...');
    const searchEngine = new SearchEngine();
    const candidateExtractor = new CandidateExtractor();
    const classifier = new Classifier();
    const dedupEngine = new DedupEngine();
    const reviewQueue = new ReviewQueue();
    const problemRepository = new ProblemRepository();
    const workbookGenerator = new WorkbookGenerator();
    logger.info('✓ Components ready');

    // Run pipeline
    logger.info('[3/7] Starting pipeline...');
    const pipeline = new Phase1Pipeline(
      searchEngine,
      candidateExtractor,
      classifier,
      dedupEngine,
      reviewQueue,
      problemRepository,
      workbookGenerator
    );

    const results = await pipeline.run(gradeId, topicId);

    logger.info('\n✓ Phase 1 Complete');
    process.exit(0);
  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

if (require.main === module) {
  runPhase1();
}

module.exports = { runPhase1 };
