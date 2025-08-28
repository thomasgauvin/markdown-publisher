-- Create documents table for storing markdown content
CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  title TEXT,
  content TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create index on created_at for faster queries
CREATE INDEX IF NOT EXISTS idx_documents_created_at ON documents(created_at);

-- Create quotas table for IP-based usage limiting
CREATE TABLE IF NOT EXISTS quotas (
  ip_address TEXT PRIMARY KEY,
  remaining_operations INTEGER NOT NULL DEFAULT 50,
  last_reset DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create operations table for logging usage
CREATE TABLE IF NOT EXISTS operations (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  ip_address TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'publish', 'view', etc.
  operation_count INTEGER NOT NULL DEFAULT 1,
  document_id TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_quotas_ip ON quotas(ip_address);
CREATE INDEX IF NOT EXISTS idx_operations_ip ON operations(ip_address);
CREATE INDEX IF NOT EXISTS idx_operations_created_at ON operations(created_at);
