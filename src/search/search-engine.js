const logger = require('../utils/logger');
const FixtureProvider = require('./fixture-provider');
const config = require('../config/env');

class SearchEngine {
  constructor() {
    this.provider = this.initProvider();
  }

  initProvider() {
    if (config.search_provider === 'fixture') {
      return new FixtureProvider();
    }
    // Phase 2: Add BingProvider, GoogleProvider, etc.
    throw new Error(`Unknown search provider: ${config.search_provider}`);
  }

  /**
   * Discover URLs based on search query
   */
  async discoverUrls(query) {
    logger.info(`Search: ${query}`);
    return await this.provider.discover(query);
  }

  /**
   * Fetch raw content from a URL
   */
  async fetchContent(url) {
    return await this.provider.fetch(url);
  }

  /**
   * Get all available fixtures (testing only)
   */
  async getAllFixtures() {
    if (config.search_provider !== 'fixture') {
      throw new Error('getAllFixtures is only available in fixture mode');
    }
    return await this.provider.getAllFixtures();
  }
}

module.exports = SearchEngine;
