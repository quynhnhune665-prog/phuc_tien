const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Review Queue Manager (Enhanced)
 * Tracks review reasons and provides auto-approval logic
 */
class ReviewQueue {
  static REVIEW_REASONS = {
    LOW_CONFIDENCE: 'Classification confidence below threshold',
    POSSIBLE_DUPLICATE: 'May be duplicate of existing problem',
    MISSING_SOURCE: 'No source URL found',
    EXTRACTION_UNCERTAIN: 'Extraction confidence is low',
    AMBIGUOUS_TOPIC: 'Topic classification is ambiguous',
    INVALID_SOURCE: 'Source URL format invalid'
  };

  /**
   * Add item to review queue with specific reason
   */
  async enqueue(problemId, reason, classificationResult) {
    if (!this.constructor.REVIEW_REASONS[reason]) {
      logger.warn(`Unknown review reason: ${reason}`);
    }

    logger.info(`Adding to review queue: problem #${problemId} (${reason})`);

    const result = await db.one(
      `INSERT INTO review_queue (problem_id, reason, classifier_result, status, priority)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [
        problemId,
        reason,
        JSON.stringify(classificationResult || {}),
        'pending',
        reason === 'MISSING_SOURCE' ? 10 : 1 // Higher priority for missing sources
      ]
    );

    return result.id;
  }

  /**
   * Get pending review items
   */
  async getPending(limit = 100) {
    return await db.manyOrNone(
      `SELECT rq.*, p.question, p.confidence
       FROM review_queue rq
       JOIN problems p ON p.id = rq.problem_id
       WHERE rq.status = $1
       ORDER BY rq.priority DESC, rq.created_at ASC
       LIMIT $2`,
      ['pending', limit]
    );
  }

  /**
   * Auto-approve high-confidence items
   */
  async autoApproveHighConfidence(thresholdConfidence = 0.90) {
    const items = await db.manyOrNone(
      `SELECT rq.problem_id, p.confidence, rq.reason
       FROM review_queue rq
       JOIN problems p ON p.id = rq.problem_id
       WHERE rq.status = $1
       AND rq.reason = $2
       AND (p.confidence->>'overall')::FLOAT >= $3`,
      ['pending', 'HIGH_CONFIDENCE_PENDING', thresholdConfidence]
    );

    logger.info(`Auto-approving ${items.length} high-confidence items (≥${(thresholdConfidence * 100).toFixed(0)}%)`);

    for (const item of items) {
      await this.approve(item.problem_id);
    }

    return items.length;
  }

  /**
   * Approve a reviewed problem
   */
  async approve(problemId) {
    // Verify has source before approving
    const hasSource = await db.oneOrNone(
      'SELECT id FROM problem_sources WHERE problem_id = $1',
      [problemId]
    );

    if (!hasSource) {
      logger.error(`Cannot approve problem #${problemId}: no source URL`);
      throw new Error(`Problem #${problemId} has no source URL - cannot approve`);
    }

    logger.info(`✓ Approving problem #${problemId}`);

    await db.none(
      'UPDATE review_queue SET status = $1, reviewed_at = NOW() WHERE problem_id = $2',
      ['approved', problemId]
    );

    await db.none(
      'UPDATE problems SET status = $1, updated_at = NOW() WHERE id = $2',
      ['approved', problemId]
    );
  }

  /**
   * Reject a reviewed problem
   */
  async reject(problemId, reason) {
    logger.info(`Rejecting problem #${problemId}: ${reason}`);

    await db.none(
      'UPDATE review_queue SET status = $1, reviewed_at = NOW(), reviewer_notes = $2 WHERE problem_id = $3',
      ['rejected', reason, problemId]
    );

    await db.none(
      'UPDATE problems SET status = $1, updated_at = NOW() WHERE id = $2',
      ['rejected', problemId]
    );
  }

  /**
   * Count pending items
   */
  async countPending() {
    const result = await db.one(
      'SELECT COUNT(*) as count FROM review_queue WHERE status = $1',
      ['pending']
    );
    return result.count;
  }
}

module.exports = ReviewQueue;
