const logger = require('../utils/logger');
const { hashSHA256, normalizeText, hashNormalized } = require('../utils/hash');

/**
 * HTML/PDF Candidate Extractor
 * Takes raw content and extracts potential problem statements
 */
class CandidateExtractor {
  /**
   * Extract candidates from raw content
   * @param {Object} rawContent - { source_url, source_title, source_domain, type, content, raw_data }
   * @returns {Array} Array of candidate objects
   */
  extract(rawContent) {
    if (!rawContent) return [];

    const candidates = [];
    const { source_url, source_title, source_domain, type, content, raw_data } = rawContent;

    logger.info(`Extracting from ${source_url}`);

    // Phase 1 Fixture: raw_data already contains question metadata
    if (raw_data && raw_data.question) {
      const candidate = {
        source_url,
        source_title,
        source_domain,
        original_text: raw_data.original_text || raw_data.question,
        question: raw_data.question,
        extracted_at: new Date().toISOString(),
        extraction_confidence: 1.0, // Fixture has perfect confidence
        extraction_method: 'fixture_direct',
        problem_index: 1
      };

      candidates.push(candidate);
      logger.info(`✓ Extracted 1 candidate from ${source_url}`);
      return candidates;
    }

    // Phase 2+ would implement HTML/PDF parsing here
    logger.warn(`No candidates found in ${source_url}`);
    return candidates;
  }

  /**
   * Validate candidate has minimum required fields
   */
  validateCandidate(candidate) {
    const required = ['source_url', 'question', 'original_text'];
    for (const field of required) {
      if (!candidate[field]) {
        logger.warn(`Candidate missing field: ${field}`);
        return false;
      }
    }
    return true;
  }
}

module.exports = CandidateExtractor;
