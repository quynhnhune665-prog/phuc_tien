const fs = require('fs');
const path = require('path');
const logger = require('../utils/logger');

class FixtureProvider {
  constructor() {
    this.fixturesPath = path.join(__dirname, '../../fixtures');
    this.sources = this.loadSources();
    this.problemsPath = path.join(this.fixturesPath, 'problems');
  }

  loadSources() {
    try {
      const sourcesPath = path.join(this.fixturesPath, 'sources.json');
      const data = fs.readFileSync(sourcesPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      logger.error('Failed to load fixture sources:', error);
      return [];
    }
  }

  /**
   * Simulates discovering URLs based on query
   * Returns fixture sources that match the fixture scope
   */
  async discover(query) {
    logger.info(`Fixture discovery: ${query}`);
    return this.sources;
  }

  /**
   * Simulates fetching raw content from a fixture source
   * Returns the raw problem data from fixture
   */
  async fetch(sourceUrl) {
    logger.info(`Fixture fetch: ${sourceUrl}`);
    
    // Find matching source
    const source = this.sources.find(s => s.url === sourceUrl);
    if (!source) {
      logger.warn(`Source not found in fixtures: ${sourceUrl}`);
      return null;
    }

    try {
      // In fixture mode, we simulate fetching by loading pre-extracted problem data
      // In real mode (Phase 2), this would return raw HTML/PDF content
      const files = fs.readdirSync(this.problemsPath);
      const problemFile = files.find(f => {
        const problem = JSON.parse(fs.readFileSync(path.join(this.problemsPath, f), 'utf-8'));
        return problem.source_url === sourceUrl;
      });

      if (problemFile) {
        const problemData = JSON.parse(
          fs.readFileSync(path.join(this.problemsPath, problemFile), 'utf-8')
        );
        return {
          source_url: sourceUrl,
          source_title: source.title,
          source_domain: source.domain,
          type: source.type,
          content: problemData.original_text,
          raw_data: problemData
        };
      }
    } catch (error) {
      logger.error(`Failed to fetch fixture for ${sourceUrl}:`, error);
    }

    return null;
  }

  /**
   * Returns all fixture problems (for testing)
   */
  async getAllFixtures() {
    try {
      const files = fs.readdirSync(this.problemsPath);
      const problems = files
        .filter(f => f.endsWith('.json'))
        .map(f => {
          const data = fs.readFileSync(path.join(this.problemsPath, f), 'utf-8');
          return JSON.parse(data);
        })
        .sort((a, b) => a.source_id.localeCompare(b.source_id));
      
      return problems;
    } catch (error) {
      logger.error('Failed to load all fixtures:', error);
      return [];
    }
  }
}

module.exports = FixtureProvider;
