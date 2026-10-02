-- Grades (Lớp 6-12)
CREATE TABLE IF NOT EXISTS grades (
  id SERIAL PRIMARY KEY,
  name VARCHAR(50) UNIQUE NOT NULL,
  level INT NOT NULL,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subjects (Toán, Lý, Hóa, ...)
CREATE TABLE IF NOT EXISTS subjects (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Grade-Subject relationship (many-to-many)
CREATE TABLE IF NOT EXISTS grade_subjects (
  id SERIAL PRIMARY KEY,
  grade_id INT NOT NULL REFERENCES grades(id) ON DELETE CASCADE,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  UNIQUE(grade_id, subject_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Chapters (Chương/Phần)
CREATE TABLE IF NOT EXISTS chapters (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  subject_id INT NOT NULL REFERENCES subjects(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Topics (Chủ đề)
CREATE TABLE IF NOT EXISTS topics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  chapter_id INT NOT NULL REFERENCES chapters(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Subtopics (chủ đề con)
CREATE TABLE IF NOT EXISTS subtopics (
  id SERIAL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  topic_id INT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Problem Types (Dạng bài: Tính góc, Chứng minh, ...)
CREATE TABLE IF NOT EXISTS problem_types (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  description TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Topic-ProblemType relationship (many-to-many)
CREATE TABLE IF NOT EXISTS topic_problem_types (
  id SERIAL PRIMARY KEY,
  topic_id INT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  problem_type_id INT NOT NULL REFERENCES problem_types(id) ON DELETE CASCADE,
  UNIQUE(topic_id, problem_type_id),
  created_at TIMESTAMP DEFAULT NOW()
);

-- Problems (Bài toán)
CREATE TABLE IF NOT EXISTS problems (
  id SERIAL PRIMARY KEY,
  title VARCHAR(300),
  question TEXT NOT NULL,
  problem_type_id INT REFERENCES problem_types(id),
  subtopic_id INT REFERENCES subtopics(id),
  topic_id INT NOT NULL REFERENCES topics(id),
  grade_id INT NOT NULL REFERENCES grades(id),
  difficulty VARCHAR(20) CHECK (difficulty IN ('basic', 'advanced')),
  
  -- Provenance & Verification
  status VARCHAR(20) DEFAULT 'candidate' CHECK (status IN ('candidate', 'review_required', 'approved', 'rejected')),
  original_text TEXT,
  normalized_text TEXT,
  
  -- Hashing (without embedding yet)
  content_hash VARCHAR(64),
  normalized_hash VARCHAR(64),
  
  -- Confidence scores
  confidence JSONB DEFAULT '{"grade": 0, "topic": 0, "type": 0, "difficulty": 0}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  
  -- Unique constraint: no duplicate originals within a source
  CONSTRAINT unique_problem_in_source UNIQUE(content_hash, grade_id, topic_id)
);

CREATE INDEX IF NOT EXISTS idx_problems_status ON problems(status);
CREATE INDEX IF NOT EXISTS idx_problems_grade ON problems(grade_id);
CREATE INDEX IF NOT EXISTS idx_problems_topic ON problems(topic_id);
CREATE INDEX IF NOT EXISTS idx_problems_type ON problems(problem_type_id);
CREATE INDEX IF NOT EXISTS idx_problems_difficulty ON problems(difficulty);
CREATE INDEX IF NOT EXISTS idx_problems_content_hash ON problems(content_hash);

-- Problem Sources (every problem must have ≥ 1 approved source)
CREATE TABLE IF NOT EXISTS problem_sources (
  id SERIAL PRIMARY KEY,
  problem_id INT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  source_url VARCHAR(500) NOT NULL,
  source_title VARCHAR(300),
  source_domain VARCHAR(200),
  extracted_text TEXT,
  
  -- Verification
  is_verified BOOLEAN DEFAULT false,
  verification_method VARCHAR(50),
  
  -- Timestamps
  retrieved_at TIMESTAMP DEFAULT NOW(),
  created_at TIMESTAMP DEFAULT NOW(),
  
  CONSTRAINT approved_problem_must_have_source CHECK (
    (SELECT status FROM problems WHERE id = problem_id) != 'approved'
    OR is_verified = true
  )
);

CREATE INDEX IF NOT EXISTS idx_problem_sources_problem ON problem_sources(problem_id);
CREATE INDEX IF NOT EXISTS idx_problem_sources_url ON problem_sources(source_url);
CREATE INDEX IF NOT EXISTS idx_problem_sources_domain ON problem_sources(source_domain);

-- Duplicate Groups
CREATE TABLE IF NOT EXISTS duplicate_groups (
  id SERIAL PRIMARY KEY,
  master_problem_id INT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  detection_layer INT CHECK (detection_layer IN (1, 2, 3, 4)),
  similarity_score FLOAT,
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected')),
  created_at TIMESTAMP DEFAULT NOW(),
  resolved_at TIMESTAMP
);

CREATE TABLE IF NOT EXISTS duplicate_members (
  id SERIAL PRIMARY KEY,
  group_id INT NOT NULL REFERENCES duplicate_groups(id) ON DELETE CASCADE,
  problem_id INT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  similarity_score FLOAT,
  UNIQUE(group_id, problem_id)
);

-- Review Queue
CREATE TABLE IF NOT EXISTS review_queue (
  id SERIAL PRIMARY KEY,
  problem_id INT NOT NULL REFERENCES problems(id) ON DELETE CASCADE,
  reason VARCHAR(100) NOT NULL,
  classifier_result JSONB,
  priority INT DEFAULT 0,
  
  -- Review metadata
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'approved', 'rejected', 'manual_fix')),
  reviewer_notes TEXT,
  reviewed_at TIMESTAMP,
  
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_review_queue_status ON review_queue(status);
CREATE INDEX IF NOT EXISTS idx_review_queue_priority ON review_queue(priority DESC);

-- Theories
CREATE TABLE IF NOT EXISTS theories (
  id SERIAL PRIMARY KEY,
  topic_id INT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  problem_type_id INT REFERENCES problem_types(id),
  name VARCHAR(200) NOT NULL,
  content TEXT NOT NULL,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Formulas
CREATE TABLE IF NOT EXISTS formulas (
  id SERIAL PRIMARY KEY,
  topic_id INT NOT NULL REFERENCES topics(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  formula VARCHAR(300) NOT NULL,
  description TEXT,
  conditions TEXT,
  usage_contexts TEXT,
  sources JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Crawl Jobs (for tracking discovery/crawl sessions)
CREATE TABLE IF NOT EXISTS crawl_jobs (
  id SERIAL PRIMARY KEY,
  grade_id INT NOT NULL REFERENCES grades(id),
  subject_id INT REFERENCES subjects(id),
  topic_id INT NOT NULL REFERENCES topics(id),
  
  -- Status and lifecycle
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'queued', 'running', 'paused', 'completed', 'failed', 'recovery')),
  
  -- Search mode
  mode VARCHAR(20) DEFAULT 'balanced' CHECK (mode IN ('fast', 'balanced', 'exhaustive')),
  target_problem_count INT,
  
  -- Progress tracking
  search_queries JSONB,
  total_urls_discovered INT DEFAULT 0,
  urls_crawled INT DEFAULT 0,
  candidates_found INT DEFAULT 0,
  problems_accepted INT DEFAULT 0,
  duplicates_found INT DEFAULT 0,
  failed_urls INT DEFAULT 0,
  
  -- Checkpoint for resume capability
  last_checkpoint JSONB,
  last_checkpoint_at TIMESTAMP,
  
  -- Timestamps
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_crawl_jobs_status ON crawl_jobs(status);
CREATE INDEX IF NOT EXISTS idx_crawl_jobs_topic ON crawl_jobs(topic_id);

-- Search Results (from discovery phase)
CREATE TABLE IF NOT EXISTS search_results (
  id SERIAL PRIMARY KEY,
  job_id INT NOT NULL REFERENCES crawl_jobs(id) ON DELETE CASCADE,
  query VARCHAR(300) NOT NULL,
  url VARCHAR(500) NOT NULL,
  title VARCHAR(300),
  snippet TEXT,
  rank INT,
  source_provider VARCHAR(50),
  
  -- Status
  status VARCHAR(20) DEFAULT 'discovered' CHECK (status IN ('discovered', 'queued', 'crawled', 'failed', 'skipped')),
  error_message TEXT,
  
  added_at TIMESTAMP DEFAULT NOW(),
  crawled_at TIMESTAMP,
  
  UNIQUE(job_id, url)
);

CREATE INDEX IF NOT EXISTS idx_search_results_job ON search_results(job_id);
CREATE INDEX IF NOT EXISTS idx_search_results_status ON search_results(status);
CREATE INDEX IF NOT EXISTS idx_search_results_url ON search_results(url);

-- Workbooks (exported DOCX)
CREATE TABLE IF NOT EXISTS workbooks (
  id SERIAL PRIMARY KEY,
  grade_id INT NOT NULL REFERENCES grades(id),
  topic_id INT NOT NULL REFERENCES topics(id),
  file_path VARCHAR(500) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  
  -- Content stats
  total_problems INT,
  basic_count INT,
  advanced_count INT,
  include_sources BOOLEAN DEFAULT true,
  
  -- Metadata
  created_by VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_workbooks_topic ON workbooks(topic_id);
CREATE INDEX IF NOT EXISTS idx_workbooks_grade ON workbooks(grade_id);
