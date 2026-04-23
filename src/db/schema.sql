-- SQLite schema for file transfer service
-- Created on first application startup

-- Uploads table: tracks each upload session
CREATE TABLE IF NOT EXISTS uploads (
  id TEXT PRIMARY KEY NOT NULL,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL CHECK (file_size > 0),
  chunk_size INTEGER NOT NULL CHECK (chunk_size > 0),
  total_chunks INTEGER NOT NULL CHECK (total_chunks > 0),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'UPLOADING', 'COMPLETED', 'EXPIRED')),
  created_at TEXT NOT NULL,
  completed_at TEXT,
  file_id TEXT UNIQUE
);

-- Create index on status and created_at for cleanup queries
CREATE INDEX IF NOT EXISTS idx_uploads_status_created ON uploads(status, created_at);
CREATE INDEX IF NOT EXISTS idx_uploads_file_id ON uploads(file_id);

-- Chunks table: tracks successfully uploaded chunks
CREATE TABLE IF NOT EXISTS chunks (
  upload_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL CHECK (chunk_index >= 0),
  size INTEGER NOT NULL CHECK (size > 0),
  etag TEXT,
  PRIMARY KEY (upload_id, chunk_index),
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

-- Create index on upload_id for faster queries
CREATE INDEX IF NOT EXISTS idx_chunks_upload_id ON chunks(upload_id);

-- Files table: permanent file references after completion
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY NOT NULL,
  upload_id TEXT NOT NULL UNIQUE,
  file_name TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  mime_type TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (upload_id) REFERENCES uploads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_files_upload_id ON files(upload_id);
