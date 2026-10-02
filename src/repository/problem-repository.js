const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Problem Repository
 * Handles database persistence for problems
 */
class ProblemRepository {
  /**
   * Create a problem candidate
   */
  async createCandidate(candidate, classification, dedup, gradeId, topicId, subtopicId, problemTypeId) {
    const { hashSHA256, hashNormalized, normalizeText } = require('../utils/hash');

    const contentHash = hashSHA256(candidate.question);
    const normalizedHash = hashNormalized(candidate.question);
    const normalizedText = normalizeText(candidate.question);

    let status = 'candidate';
    let reason = null;

    // Determine initial status
    if (!candidate.source_url) {
      status = 'rejected';
      reason = 'no_source_url';
    } else if (dedup.is_duplicate) {
      status = 'rejected';
      reason = 'exact_duplicate';
    } else if (dedup.suspected_duplicate || classification.requires_review) {
      status = 'review_required';
      reason = dedup.suspected_duplicate ? 'suspected_duplicate' : 'low_confidence';
    }

    const problem = await db.one(
      `INSERT INTO problems
       (title, question, problem_type_id, subtopic_id, topic_id, grade_id, difficulty,
        status, original_text, normalized_text, content_hash, normalized_hash, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        candidate.question.substring(0, 300),
        candidate.question,
        problemTypeId,
        subtopicId,
        topicId,
        gradeId,
        classification.difficulty.value,
        status,
        candidate.original_text,
        normalizedText,
        contentHash,
        normalizedHash,
        JSON.stringify({
          grade: classification.grade.confidence,
          topic: classification.topic.confidence,
          type: classification.problemType.confidence,
          difficulty: classification.difficulty.confidence,
          overall_confidence: classification.overall_confidence
        })
      ]
    );

    logger.info(`Created problem ${problem.id} with status: ${status}`);

    return { problem, status, reason };
  }

  /**
   * Add source to problem
   */
  async addSource(problemId, sourceUrl, sourceTitle, sourceDomain, extractedText) {
    const source = await db.one(
      `INSERT INTO problem_sources
       (problem_id, source_url, source_title, source_domain, extracted_text, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [problemId, sourceUrl, sourceTitle, sourceDomain, extractedText, true]
    );

    logger.info(`Added source ${source.id} to problem ${problemId}`);
    return source;
  }

  /**
   * Count problems by status
   */
  async countByStatus() {
    const result = await db.manyOrNone(
      'SELECT status, COUNT(*) as count FROM problems GROUP BY status'
    );

    const counts = {};
    for (const row of result) {
      counts[row.status] = row.count;
    }

    return counts;
  }

  /**
   * Get approved problems
   */
  async getApproved(limit = 1000) {
    return await db.manyOrNone(
      `SELECT p.*, ps.source_url
       FROM problems p
       LEFT JOIN problem_sources ps ON ps.problem_id = p.id
       WHERE p.status = $1
       LIMIT $2`,
      ['approved', limit]
    );
  }

  /**
   * Verify all approved problems have sources
   */
  async verifyProvenance() {
    const orphaned = await db.manyOrNone(
      `SELECT p.id FROM problems p
       WHERE p.status = $1
       AND NOT EXISTS (SELECT 1 FROM problem_sources ps WHERE ps.problem_id = p.id)`,
      ['approved']
    );

    if (orphaned.length > 0) {
      logger.error(`PROVENANCE VIOLATION: ${orphaned.length} approved problems without sources`);
      return false;
    }

    logger.info(`✓ All approved problems have sources`);
    return true;
  }

  /**
   * Check no unapproved problems in workbook
   */
  async checkOnlyApprovedForWorkbook() {
    const unapproved = await db.oneOrNone(
      `SELECT COUNT(*) as count FROM problems WHERE status != $1 AND status IS NOT NULL`,
      ['approved']
    );

    if (unapproved && unapproved.count > 0) {
      logger.warn(`${unapproved.count} non-approved problems exist in database`);
    }

    return true;
  }
}

module.exports = ProblemRepository;
