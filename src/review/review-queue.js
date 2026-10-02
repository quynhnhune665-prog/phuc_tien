const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Review Queue Manager
 * Handles items that require manual review before approval
 */
class ReviewQueue {
  /**
   * Add item to review queue
   */
  async enqueue(problemId, reason, classifierResult) {
    logger.info(`Adding to review queue: ${problemId} (${reason})`);

    const result = await db.one(
      `INSERT INTO review_queue (problem_id, reason, classifier_result, status)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [problemId, reason, JSON.stringify(classifierResult || {}), 'pending']
    );

    return result.id;
  }

  /**
   * Get pending review items
   */
  async getPending(limit = 100) {
    return await db.manyOrNone(
      'SELECT * FROM review_queue WHERE status = $1 ORDER BY priority DESC, created_at ASC LIMIT $2',
      ['pending', limit]
    );
  }

  /**
   * Mark as approved
   */
  async approve(problemId) {
    logger.info(`Approving from review: ${problemId}`);

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
   * Mark as rejected
   */
  async reject(problemId, reason) {
    logger.info(`Rejecting from review: ${problemId}`);

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
   * Auto-approve high-confidence items
   */
  async autoApproveHighConfidence(thresholdConfidence = 0.90) {
    const items = await db.manyOrNone(
      `SELECT rq.problem_id, p.confidence
       FROM review_queue rq
       JOIN problems p ON p.id = rq.problem_id
       WHERE rq.status = $1
       AND (p.confidence->>'overall_confidence')::FLOAT >= $2`,
      ['pending', thresholdConfidence]
    );

    logger.info(`Auto-approving ${items.length} high-confidence items (≥${(thresholdConfidence * 100).toFixed(0)}%)`);

    for (const item of items) {
      await this.approve(item.problem_id);
    }

    return items.length;
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
