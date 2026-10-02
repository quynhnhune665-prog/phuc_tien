require('dotenv').config();

module.exports = {
  node_env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3847,
  search_provider: process.env.SEARCH_PROVIDER || 'fixture',
  bing_api_key: process.env.BING_API_KEY,
  crawler: {
    timeout: parseInt(process.env.CRAWLER_TIMEOUT) || 30000,
    maxRetries: parseInt(process.env.CRAWLER_MAX_RETRIES) || 3,
    rateLimitMs: parseInt(process.env.CRAWLER_RATE_LIMIT_MS) || 1000,
    userAgent: process.env.CRAWLER_USER_AGENT || 'PTien-Math-Hunter/1.0'
  },
  dedup: {
    exactEnabled: process.env.DEDUP_EXACT_ENABLED === 'true',
    normalizeEnabled: process.env.DEDUP_NORMALIZE_ENABLED === 'true',
    similarityThreshold: parseFloat(process.env.DEDUP_SIMILARITY_THRESHOLD) || 0.85,
    semanticEnabled: process.env.DEDUP_SEMANTIC_ENABLED === 'true',
    semanticThreshold: parseFloat(process.env.DEDUP_SEMANTIC_THRESHOLD) || 0.90
  },
  limits: {
    maxSearchQueries: parseInt(process.env.MAX_SEARCH_QUERIES) || 50,
    maxUrlsPerQuery: parseInt(process.env.MAX_URLS_PER_QUERY) || 100,
    maxCrawlWorkers: parseInt(process.env.MAX_CRAWL_WORKERS) || 3,
    maxProblemsTarget: process.env.MAX_PROBLEMS_TARGET === 'null' ? null : parseInt(process.env.MAX_PROBLEMS_TARGET)
  },
  logging: {
    level: process.env.LOG_LEVEL || 'info'
  }
};
