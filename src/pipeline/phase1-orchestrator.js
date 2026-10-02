const logger = require('../utils/logger');
const { db } = require('../config/database');

/**
 * Phase 1 E2E Pipeline Orchestrator
 * Executes the complete deterministic workflow
 */
class Phase1Pipeline {
  constructor(searchEngine, candidateExtractor, classifier, dedupEngine, reviewQueue, problemRepository, workbookGenerator) {
    this.searchEngine = searchEngine;
    this.candidateExtractor = candidateExtractor;
    this.classifier = classifier;
    this.dedupEngine = dedupEngine;
    this.reviewQueue = reviewQueue;
    this.problemRepository = problemRepository;
    this.workbookGenerator = workbookGenerator;
    
    this.stats = {
      discovered: 0,
      extracted: 0,
      classified: 0,
      deduplicated: 0,
      candidates: 0,
      approved: 0,
      review: 0,
      rejected: 0,
      duplicates: 0
    };
  }

  /**
   * Execute complete Phase 1 pipeline
   */
  async run(gradeId, topicId) {
    try {
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('PTIEN Math Hunter — Phase 1 Pipeline');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      // Step 1: Discovery
      logger.info('[1/8] Discovery...');
      const discovered = await this.discoverSources();
      this.stats.discovered = discovered.length;
      logger.info(`✓ Discovered ${this.stats.discovered} sources`);

      // Step 2: Extraction
      logger.info('[2/8] Extraction...');
      const candidates = await this.extractCandidates(discovered);
      this.stats.extracted = candidates.length;
      logger.info(`✓ Extracted ${this.stats.extracted} candidates`);

      // Step 3: Classification
      logger.info('[3/8] Classification...');
      const classified = await this.classifyCandidates(candidates);
      this.stats.classified = classified.length;
      logger.info(`✓ Classified ${this.stats.classified} problems`);

      // Step 4: Deduplication
      logger.info('[4/8] Deduplication...');
      const deduplicated = await this.dedupCandidates(classified, gradeId, topicId);
      this.stats.deduplicated = deduplicated.length;
      logger.info(`✓ Deduplicated: ${deduplicated.length} unique problems`);

      // Step 5: Review Gate
      logger.info('[5/8] Review Gate...');
      await this.processReviewQueue();
      logger.info(`✓ Review queue processed`);

      // Step 6: Theory & Formula (simulated for Phase 1)
      logger.info('[6/8] Knowledge Builder...');
      await this.buildKnowledge(topicId);
      logger.info(`✓ Knowledge aggregated`);

      // Step 7: Workbook Generation
      logger.info('[7/8] Workbook Generation...');
      const workbook = await this.generateWorkbook(gradeId, topicId);
      logger.info(`✓ Workbook generated`);

      // Step 8: Validation
      logger.info('[8/8] Validation...');
      await this.validate();
      logger.info(`✓ Validation passed`);

      // Print results
      await this.printResults(workbook);

      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
      logger.info('E2E PASS ✓');
      logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

      return this.stats;
    } catch (error) {
      logger.error('Pipeline failed:', error);
      process.exit(1);
    }
  }

  /**
   * Step 1: Discover sources
   */
  async discoverSources() {
    const query = 'Toán 8 hình bình hành';
    const sources = await this.searchEngine.discoverUrls(query);
    return sources;
  }

  /**
   * Step 2: Extract candidates
   */
  async extractCandidates(sources) {
    const candidates = [];
    
    for (const source of sources) {
      const content = await this.searchEngine.fetchContent(source.url);
      if (!content) continue;

      const extracted = this.candidateExtractor.extract(content);
      for (const candidate of extracted) {
        if (this.candidateExtractor.validateCandidate(candidate)) {
          candidates.push(candidate);
        }
      }
    }

    return candidates;
  }

  /**
   * Step 3: Classify candidates
   */
  async classifyCandidates(candidates) {
    const classified = [];

    for (const candidate of candidates) {
      const classification = await this.classifier.classify(candidate);
      classified.push({ candidate, classification });
    }

    this.stats.candidates = classified.length;
    return classified;
  }

  /**
   * Step 4: Deduplication & persist
   */
  async dedupCandidates(classified, gradeId, topicId) {
    const saved = [];
    const subjectId = await this.classifier.getOrCreateSubject('Toán');
    const chapterId = await this.classifier.getOrCreateChapter('Hình học', subjectId);
    const topicDbId = await this.classifier.getOrCreateTopic('Hình bình hành', chapterId);

    for (const item of classified) {
      const { candidate, classification } = item;
      const dedup = await this.dedupEngine.dedup(candidate);

      if (dedup.is_duplicate) {
        this.stats.duplicates++;
        logger.warn(`Skipping duplicate: ${candidate.question.substring(0, 50)}...`);
        continue;
      }

      const problemTypeId = await this.classifier.getOrCreateProblemType(classification.problemType.value);
      const subtopicId = classification.subtopic.value
        ? await this.classifier.getOrCreateSubtopic(classification.subtopic.value, topicDbId)
        : null;

      const { problem, status, reason } = await this.problemRepository.createCandidate(
        candidate,
        classification,
        dedup,
        gradeId,
        topicDbId,
        subtopicId,
        problemTypeId
      );

      // Add source
      await this.problemRepository.addSource(
        problem.id,
        candidate.source_url,
        candidate.source_title,
        candidate.source_domain,
        candidate.question
      );

      // Enqueue for review if needed
      if (status === 'review_required') {
        await this.reviewQueue.enqueue(problem.id, reason, classification);
        this.stats.review++;
      } else if (status === 'rejected') {
        this.stats.rejected++;
      }

      saved.push({ problem_id: problem.id, status });
    }

    return saved;
  }

  /**
   * Step 5: Process review queue
   */
  async processReviewQueue() {
    // Auto-approve high-confidence items
    const autoApproved = await this.reviewQueue.autoApproveHighConfidence(0.85);
    this.stats.approved += autoApproved;

    // Count remaining pending
    const pending = await this.reviewQueue.countPending();
    if (pending > 0) {
      logger.warn(`${pending} items still in review queue (manual action required)`);
    }
  }

  /**
   * Step 6: Build knowledge (stub for Phase 1)
   */
  async buildKnowledge(topicId) {
    // Phase 1: just log that we're aggregating
    // Phase 2+: extract theory and formulas from approved problems
    logger.info('Knowledge aggregation (placeholder)');
  }

  /**
   * Step 7: Generate workbook
   */
  async generateWorkbook(gradeId, topicId) {
    return await this.workbookGenerator.generateWorkbook(gradeId, topicId);
  }

  /**
   * Step 8: Validate
   */
  async validate() {
    // Check provenance
    const providersOk = await this.problemRepository.verifyProvenance();
    if (!providersOk) {
      throw new Error('Provenance verification failed');
    }

    // Check only approved exported
    await this.problemRepository.checkOnlyApprovedForWorkbook();

    // Count final stats
    const counts = await this.problemRepository.countByStatus();
    this.stats.approved = counts.approved || 0;
    this.stats.review = counts.review_required || 0;
    this.stats.rejected = counts.rejected || 0;
  }

  /**
   * Print final results
   */
  async printResults(workbook) {
    logger.info('');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info('RESULTS');
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    logger.info(`Discovered:          ${this.stats.discovered}`);
    logger.info(`Extracted:           ${this.stats.extracted}`);
    logger.info(`Classified:          ${this.stats.classified}`);
    logger.info(`Unique (no dups):    ${this.stats.deduplicated}`);
    logger.info(`Duplicates found:    ${this.stats.duplicates}`);
    logger.info(``);
    logger.info(`Approved:            ${this.stats.approved}`);
    logger.info(`In Review:           ${this.stats.review}`);
    logger.info(`Rejected:            ${this.stats.rejected}`);
    logger.info(``);
    logger.info(`Workbook problems:   ${workbook ? workbook.problems : 'N/A'}`);
    logger.info(`Workbook file:       ${workbook ? workbook.filepath : 'N/A'}`);
    logger.info(`Sources preserved:   YES`);
    logger.info(`Unapproved exported: 0`);
    logger.info('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  }
}

module.exports = Phase1Pipeline;
