const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Classification Engine
 * Assigns grade, topic, type, difficulty with confidence scores
 */
class Classifier {
  constructor() {
    // Phase 1: deterministic rules based on keywords
    // Phase 3: ML-based classification
    this.rules = this.loadRules();
  }

  loadRules() {
    return {
      grade: {
        8: ['lớp 8', 'toán 8', 'grade 8'],
        9: ['lớp 9', 'toán 9', 'grade 9']
      },
      subject: {
        'Toán': ['toán', 'math', 'hình học', 'đại số']
      },
      topic: {
        'Hình bình hành': ['hình bình hành', 'parallelogram', 'hbh']
      },
      subtopic: {
        'Tính chất cạnh': ['cạnh', 'chu vi', 'độ dài'],
        'Tính chất góc': ['góc', 'angle'],
        'Đường chéo': ['đường chéo', 'diagonal'],
        'Trung điểm': ['trung điểm', 'midpoint'],
        'Dấu hiệu nhận biết': ['dấu hiệu', 'recognition', 'chứng minh'],
        'Di ện tích': ['diện tích', 'area']
      },
      problemType: {
        'Tính chu vi': ['chu vi'],
        'Tính góc': ['tính góc', 'calculate angle'],
        'Tính độ dài': ['tính độ dài', 'calculate length'],
        'Chứng minh': ['chứng minh', 'prove'],
        'Nhận biết': ['nhận biết', 'identify'],
        'Tính diện tích': ['diện tích', 'area']
      },
      difficulty: {
        basic: ['cơ bản', 'basic', 'đơn giản'],
        advanced: ['nâng cao', 'advanced', 'phức tạp']
      }
    };
  }

  /**
   * Classify a candidate problem
   */
  async classify(candidate) {
    const text = (candidate.question + ' ' + candidate.original_text).toLowerCase();

    const result = {
      grade: this.classifyField(text, 'grade'),
      subject: { value: 'Toán', confidence: 0.95 }, // Default for Phase 1
      chapter: { value: 'Hình học', confidence: 0.90 },
      topic: this.classifyField(text, 'topic'),
      subtopic: this.classifyField(text, 'subtopic'),
      problemType: this.classifyField(text, 'problemType'),
      difficulty: this.classifyField(text, 'difficulty')
    };

    // Check if classification is confident
    const avgConfidence = (
      result.grade.confidence +
      result.topic.confidence +
      result.problemType.confidence +
      result.difficulty.confidence
    ) / 4;

    result.overall_confidence = avgConfidence;
    result.requires_review = avgConfidence < 0.80;

    logger.info(`Classified: ${result.topic.value} - ${result.problemType.value} (${(avgConfidence * 100).toFixed(0)}%)`);

    return result;
  }

  /**
   * Classify a single field using keyword matching
   */
  classifyField(text, fieldType) {
    const rules = this.rules[fieldType];
    let bestMatch = null;
    let bestScore = 0;

    for (const [value, keywords] of Object.entries(rules)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword)) score += 1;
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = value;
      }
    }

    if (!bestMatch) {
      return {
        value: Object.keys(rules)[0],
        confidence: 0.5,
        matched: false
      };
    }

    return {
      value: bestMatch,
      confidence: Math.min(0.95, 0.5 + (bestScore * 0.15)),
      matched: true
    };
  }

  /**
   * Get or create grade
   */
  async getOrCreateGrade(gradeNumber) {
    const result = await db.oneOrNone(
      'SELECT id FROM grades WHERE level = $1',
      [gradeNumber]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO grades (name, level) VALUES ($1, $2) RETURNING id',
      [String(gradeNumber), gradeNumber]
    );
    return created.id;
  }

  /**
   * Get or create subject
   */
  async getOrCreateSubject(subjectName) {
    const result = await db.oneOrNone(
      'SELECT id FROM subjects WHERE name = $1',
      [subjectName]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO subjects (name) VALUES ($1) RETURNING id',
      [subjectName]
    );
    return created.id;
  }

  /**
   * Get or create chapter
   */
  async getOrCreateChapter(chapterName, subjectId) {
    const result = await db.oneOrNone(
      'SELECT id FROM chapters WHERE name = $1 AND subject_id = $2',
      [chapterName, subjectId]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO chapters (name, subject_id) VALUES ($1, $2) RETURNING id',
      [chapterName, subjectId]
    );
    return created.id;
  }

  /**
   * Get or create topic
   */
  async getOrCreateTopic(topicName, chapterId) {
    const result = await db.oneOrNone(
      'SELECT id FROM topics WHERE name = $1 AND chapter_id = $2',
      [topicName, chapterId]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO topics (name, chapter_id) VALUES ($1, $2) RETURNING id',
      [topicName, chapterId]
    );
    return created.id;
  }

  /**
   * Get or create subtopic
   */
  async getOrCreateSubtopic(subtopicName, topicId) {
    if (!subtopicName) return null;

    const result = await db.oneOrNone(
      'SELECT id FROM subtopics WHERE name = $1 AND topic_id = $2',
      [subtopicName, topicId]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO subtopics (name, topic_id) VALUES ($1, $2) RETURNING id',
      [subtopicName, topicId]
    );
    return created.id;
  }

  /**
   * Get or create problem type
   */
  async getOrCreateProblemType(typeName) {
    const result = await db.oneOrNone(
      'SELECT id FROM problem_types WHERE name = $1',
      [typeName]
    );
    if (result) return result.id;

    const created = await db.one(
      'INSERT INTO problem_types (name) VALUES ($1) RETURNING id',
      [typeName]
    );
    return created.id;
  }
}

module.exports = Classifier;
