const logger = require('../utils/logger');

/**
 * Classification Engine (Upgraded)
 * Assigns detailed classification with per-field confidence
 */
class Classifier {
  constructor() {
    this.rules = this.loadRules();
    this.CONFIDENCE_THRESHOLD = 0.80; // Below this → REVIEW
  }

  loadRules() {
    return {
      grade: {
        6: ['lớp 6', 'toán 6', 'grade 6'],
        7: ['lớp 7', 'toán 7', 'grade 7'],
        8: ['lớp 8', 'toán 8', 'grade 8'],
        9: ['lớp 9', 'toán 9', 'grade 9'],
        10: ['lớp 10', 'toán 10', 'grade 10'],
        11: ['lớp 11', 'toán 11', 'grade 11'],
        12: ['lớp 12', 'toán 12', 'grade 12']
      },
      subject: {
        'Mathematics': ['toán', 'math', 'hình học', 'đại số']
      },
      chapter: {
        'Geometry': ['hình học', 'hình', 'geometry', 'tam giác', 'hình bình hành', 'hình vuông']
      },
      topic: {
        'Parallelogram': ['hình bình hành', 'parallelogram', 'hbh']
      },
      subtopic: {
        'Properties': ['tính chất', 'property', 'properties'],
        'Angles': ['góc', 'angle', 'angles'],
        'Sides': ['cạnh', 'side', 'sides'],
        'Diagonals': ['đường chéo', 'diagonal', 'diagonals'],
        'Perimeter': ['chu vi', 'perimeter'],
        'Area': ['diện tích', 'area'],
        'Recognition': ['dấu hiệu', 'nhận biết', 'recognize', 'identify'],
        'Proof': ['chứng minh', 'prove', 'proof'],
        'Midpoint': ['trung điểm', 'midpoint']
      },
      problemType: {
        'Perimeter Calculation': ['chu vi'],
        'Angle Calculation': ['tính góc', 'calculate angle'],
        'Length Calculation': ['tính độ dài', 'calculate length'],
        'Area Calculation': ['tính diện tích', 'calculate area'],
        'Proof': ['chứng minh', 'prove'],
        'Recognition': ['nhận biết', 'identify', 'recognize']
      },
      difficulty: {
        'Basic': ['cơ bản', 'basic', 'đơn giản', 'simple'],
        'Advanced': ['nâng cao', 'advanced', 'phức tạp', 'complex']
      }
    };
  }

  /**
   * Classify with detailed confidence breakdown
   */
  async classify(candidate) {
    const text = (candidate.question + ' ' + candidate.original_text).toLowerCase();

    const result = {
      grade: this.classifyField(text, 'grade', 8), // Default Grade 8
      subject: { value: 'Mathematics', confidence: 0.95 },
      chapter: this.classifyField(text, 'chapter', 'Geometry'),
      topic: this.classifyField(text, 'topic', 'Parallelogram'),
      subtopic: this.classifyField(text, 'subtopic'),
      problemTypes: this.classifyMultiple(text, 'problemType'),
      difficulty: this.classifyField(text, 'difficulty', 'Basic'),
      confidence: {},
      decision: 'PENDING'
    };

    // Calculate per-field confidence
    result.confidence = {
      grade: result.grade.confidence,
      subject: result.subject.confidence,
      chapter: result.chapter.confidence,
      topic: result.topic.confidence,
      subtopic: result.subtopic?.confidence || 0.5,
      problemType: result.problemTypes.length > 0
        ? result.problemTypes.reduce((acc, t) => acc + t.confidence, 0) / result.problemTypes.length
        : 0.5,
      difficulty: result.difficulty.confidence
    };

    // Overall confidence
    result.confidence.overall = Object.values(result.confidence).reduce((a, b) => a + b) / Object.keys(result.confidence).length;

    // Decision
    if (result.confidence.overall >= this.CONFIDENCE_THRESHOLD) {
      result.decision = 'APPROVED';
    } else {
      result.decision = 'REVIEW';
    }

    logger.info(
      `Classified: ${result.topic.value} - ${result.problemTypes.map(t => t.value).join(', ')} (${(result.confidence.overall * 100).toFixed(0)}%)`
    );

    return result;
  }

  /**
   * Classify single field with confidence
   */
  classifyField(text, fieldType, defaultValue = null) {
    const rules = this.rules[fieldType];
    let bestMatch = defaultValue;
    let bestScore = 0;

    if (!rules) {
      return { value: defaultValue, confidence: 0.5, matched: false };
    }

    for (const [value, keywords] of Object.entries(rules)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      if (score > bestScore) {
        bestScore = score;
        bestMatch = value;
      }
    }

    if (bestMatch === defaultValue && bestScore === 0) {
      return {
        value: bestMatch,
        confidence: 0.5,
        matched: false
      };
    }

    return {
      value: bestMatch,
      confidence: Math.min(0.99, 0.5 + (bestScore * 0.15)),
      matched: bestScore > 0
    };
  }

  /**
   * Classify multiple values (for problem types)
   */
  classifyMultiple(text, fieldType) {
    const rules = this.rules[fieldType];
    const matches = [];

    for (const [value, keywords] of Object.entries(rules)) {
      let score = 0;
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          score += 1;
        }
      }
      if (score > 0) {
        matches.push({
          value,
          confidence: Math.min(0.99, 0.5 + (score * 0.15))
        });
      }
    }

    // If no matches, default
    if (matches.length === 0) {
      matches.push({
        value: 'General Problem',
        confidence: 0.5
      });
    }

    return matches.sort((a, b) => b.confidence - a.confidence);
  }

  // Database helper methods...
  async getOrCreateGrade(gradeNumber) {
    const { db } = require('../config/database');
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

  async getOrCreateSubject(subjectName) {
    const { db } = require('../config/database');
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

  async getOrCreateChapter(chapterName, subjectId) {
    const { db } = require('../config/database');
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

  async getOrCreateTopic(topicName, chapterId) {
    const { db } = require('../config/database');
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

  async getOrCreateSubtopic(subtopicName, topicId) {
    const { db } = require('../config/database');
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

  async getOrCreateProblemType(typeName) {
    const { db } = require('../config/database');
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
