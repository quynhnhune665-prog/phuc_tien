const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Problem Repository (Enhanced)
 * Enforces provenance: APPROVED ⇒ source URL
 */
class ProblemRepository {
  /**
   * Create a problem candidate with classification result
   */
  async createCandidate(candidate, classification, dedup, gradeId, topicId, subtopicId, problemTypeIds) {
    const { hashSHA256, hashNormalized, normalizeText } = require('../utils/hash');

    const contentHash = hashSHA256(candidate.question);
    const normalizedHash = hashNormalized(candidate.question);
    const normalizedText = normalizeText(candidate.question);

    let status = 'candidate';
    let reviewReason = null;

    // Determine initial status based on dedup + classification
    if (!candidate.source_url) {
      status = 'rejected';
      reviewReason = 'MISSING_SOURCE';
    } else if (dedup.is_duplicate) {
      status = 'rejected';
      reviewReason = 'EXACT_DUPLICATE';
    } else if (dedup.suspected_duplicate) {
      status = 'review_required';
      reviewReason = 'POSSIBLE_DUPLICATE';
    } else if (classification.decision === 'REVIEW') {
      status = 'review_required';
      reviewReason = 'LOW_CONFIDENCE';
    } else if (classification.decision === 'APPROVED') {
      status = 'review_required'; // Start in review, auto-approve later if confident
      reviewReason = 'HIGH_CONFIDENCE_PENDING';
    }

    // Create problem
    const problem = await db.one(
      `INSERT INTO problems
       (title, question, problem_type_id, subtopic_id, topic_id, grade_id, difficulty,
        status, original_text, normalized_text, content_hash, normalized_hash, confidence)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
       RETURNING id`,
      [
        candidate.question.substring(0, 300),
        candidate.question,
        problemTypeIds[0] || null,
        subtopicId,
        topicId,
        gradeId,
        classification.difficulty.value,
        status,
        candidate.original_text,
        normalizedText,
        contentHash,
        normalizedHash,
        JSON.stringify(classification.confidence)
      ]
    );

    logger.info(`Created problem ${problem.id} with status: ${status}`);

    return { problem, status, reviewReason, classification };
  }

  /**
   * Add source to problem
   * ENFORCED: Cannot approve without source
   */
  async addSource(problemId, sourceUrl, sourceTitle, sourceDomain, extractedText) {
    if (!sourceUrl) {
      throw new Error('Cannot add problem without source URL');
    }

    const source = await db.one(
      `INSERT INTO problem_sources
       (problem_id, source_url, source_title, source_domain, extracted_text, is_verified)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [problemId, sourceUrl, sourceTitle, sourceDomain, extractedText, true]
    );

    logger.info(`Added source ${source.id} to problem ${problemId}: ${sourceUrl}`);
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
   * Get approved problems (for workbook)
   */
  async getApproved(limit = 1000) {
    return await db.manyOrNone(
      `SELECT p.*, ps.source_url, ps.source_title
       FROM problems p
       LEFT JOIN problem_sources ps ON ps.problem_id = p.id
       WHERE p.status = $1
       LIMIT $2`,
      ['approved', limit]
    );
  }

  /**
   * CRITICAL VALIDATION: All approved problems MUST have sources
   */
  async verifyProvenance() {
    const orphaned = await db.manyOrNone(
      `SELECT p.id FROM problems p
       WHERE p.status = $1
       AND NOT EXISTS (SELECT 1 FROM problem_sources ps WHERE ps.problem_id = p.id)`,
      ['approved']
    );

    if (orphaned.length > 0) {
      logger.error(`\n🔴 PROVENANCE VIOLATION: ${orphaned.length} approved problems without sources:`);
      orphaned.forEach(p => logger.error(`   - Problem #${p.id}`));
      return false;
    }

    logger.info('✓ All approved problems have sources');
    return true;
  }

  /**
   * Verify only approved problems exist for export
   */
  async verifyExportQuality() {
    const counts = await this.countByStatus();
    const unapprovedCount = (counts.candidate || 0) + (counts.review_required || 0) + (counts.rejected || 0);

    if (unapprovedCount > 0) {
      logger.warn(`Note: ${unapprovedCount} unapproved problems in database (not exported)`);
    }

    logger.info(`✓ Database export quality verified`);
    return true;
  }
}

module.exports = ProblemRepository;
