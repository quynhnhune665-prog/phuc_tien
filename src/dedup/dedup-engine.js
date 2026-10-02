const logger = require('../utils/logger');
const { hashSHA256, normalizeText, hashNormalized } = require('../utils/hash');
const { db } = require('../config/database');

/**
 * 4-Layer Deduplication Engine
 * Layer 1: Exact hash
 * Layer 2: Normalized hash
 * Layer 3: Near-duplicate (Jaccard similarity)
 * Layer 4: Semantic (embedding-based, Phase 3)
 */
class DedupEngine {
  /**
   * Run full dedup pipeline on a candidate
   */
  async dedup(candidate) {
    const contentHash = hashSHA256(candidate.question);
    const normalizedHash = hashNormalized(candidate.question);

    // Layer 1: Exact hash
    const exactMatch = await this.checkExactDuplicate(contentHash);
    if (exactMatch) {
      logger.warn(`Exact duplicate found: ${exactMatch.id}`);
      return {
        is_duplicate: true,
        layer: 1,
        master_id: exactMatch.id,
        similarity_score: 1.0,
        action: 'merge_with_master'
      };
    }

    // Layer 2: Normalized hash
    const normalizedMatch = await this.checkNormalizedDuplicate(normalizedHash);
    if (normalizedMatch) {
      logger.warn(`Normalized duplicate found: ${normalizedMatch.id}`);
      return {
        is_duplicate: true,
        layer: 2,
        master_id: normalizedMatch.id,
        similarity_score: 0.95,
        action: 'merge_with_master'
      };
    }

    // Layer 3: Near-duplicate (Jaccard similarity)
    const nearMatch = await this.checkNearDuplicate(candidate.question);
    if (nearMatch) {
      logger.warn(`Near duplicate suspected: ${nearMatch.id} (similarity: ${nearMatch.similarity_score})`);
      return {
        is_duplicate: false,
        suspected_duplicate: true,
        layer: 3,
        master_id: nearMatch.id,
        similarity_score: nearMatch.similarity_score,
        action: 'review'
      };
    }

    // Layer 4: Semantic (not implemented in Phase 1)
    logger.info(`✓ Passed all dedup layers`);
    return {
      is_duplicate: false,
      suspected_duplicate: false,
      layer: 0,
      master_id: null,
      similarity_score: 0,
      action: 'accept'
    };
  }

  /**
   * Layer 1: Check exact SHA-256 hash
   */
  async checkExactDuplicate(contentHash) {
    const result = await db.oneOrNone(
      'SELECT id FROM problems WHERE content_hash = $1 AND status IN ($2, $3)',
      [contentHash, 'approved', 'review_required']
    );
    return result;
  }

  /**
   * Layer 2: Check normalized hash
   */
  async checkNormalizedDuplicate(normalizedHash) {
    const result = await db.oneOrNone(
      'SELECT id FROM problems WHERE normalized_hash = $1 AND status IN ($2, $3)',
      [normalizedHash, 'approved', 'review_required']
    );
    return result;
  }

  /**
   * Layer 3: Jaccard similarity-based near-duplicate detection
   */
  async checkNearDuplicate(questionText, threshold = 0.85) {
    const shingles = this.getShingles(normalizeText(questionText), 3);
    const allProblems = await db.manyOrNone(
      'SELECT id, normalized_text FROM problems WHERE status IN ($1, $2)',
      ['approved', 'review_required']
    );

    let bestMatch = null;
    let bestScore = 0;

    for (const problem of allProblems) {
      if (!problem.normalized_text) continue;

      const existingShingles = this.getShingles(problem.normalized_text, 3);
      const similarity = this.jaccardSimilarity(shingles, existingShingles);

      if (similarity > bestScore && similarity >= threshold) {
        bestScore = similarity;
        bestMatch = { id: problem.id, similarity_score: similarity };
      }
    }

    return bestMatch;
  }

  /**
   * Generate 3-grams (shingles) from text
   */
  getShingles(text, k = 3) {
    const shingles = new Set();
    const words = text.split(/\s+/).filter(w => w.length > 0);
    
    for (let i = 0; i <= words.length - k; i++) {
      shingles.add(words.slice(i, i + k).join(' '));
    }
    
    return shingles;
  }

  /**
   * Calculate Jaccard similarity between two sets
   */
  jaccardSimilarity(set1, set2) {
    const intersection = new Set([...set1].filter(x => set2.has(x)));
    const union = new Set([...set1, ...set2]);
    return union.size === 0 ? 0 : intersection.size / union.size;
  }
}

module.exports = DedupEngine;
