import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs/promises';
import { getLogger } from '../config/logger';

const logger = getLogger();

let dbInstance: sqlite3.Database | null = null;

/**
 * Initialize SQLite database connection.
 * Create database file if it doesn't exist.
 */
export async function initializeDatabase(dbPath: string): Promise<sqlite3.Database> {
  if (dbInstance) {
    return dbInstance;
  }

  return new Promise((resolve, reject) => {
    // Ensure directory exists
    const dir = path.dirname(dbPath);
    fs.mkdir(dir, { recursive: true }).catch(reject);

    dbInstance = new sqlite3.Database(dbPath, (err) => {
      if (err) {
        logger.error({ error: err }, 'Failed to connect to database');
        reject(err);
      } else {
        logger.info({ dbPath }, 'Database connected');
        resolve(dbInstance!);
      }
    });
  });
}

/**
 * Get database instance (must call initializeDatabase first).
 */
export function getDatabase(): sqlite3.Database {
  if (!dbInstance) {
    throw new Error('Database not initialized. Call initializeDatabase first.');
  }
  return dbInstance;
}

/**
 * Execute a SQL query with parameters.
 */
export async function runQuery(
  sql: string,
  params: any[] = []
): Promise<{ lastID?: number; changes?: number }> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) {
        reject(err);
      } else {
        resolve({ lastID: this.lastID, changes: this.changes });
      }
    });
  });
}

/**
 * Execute a query and return a single row.
 */
export async function getOne<T = any>(sql: string, params: any[] = []): Promise<T | undefined> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        reject(err);
      } else {
        resolve(row as T | undefined);
      }
    });
  });
}

/**
 * Execute a query and return all matching rows.
 */
export async function getAll<T = any>(sql: string, params: any[] = []): Promise<T[]> {
  const db = getDatabase();

  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        reject(err);
      } else {
        resolve((rows || []) as T[]);
      }
    });
  });
}

/**
 * Close database connection.
 */
export async function closeDatabase(): Promise<void> {
  if (!dbInstance) {
    return;
  }

  return new Promise((resolve, reject) => {
    dbInstance!.close((err) => {
      if (err) {
        reject(err);
      } else {
        logger.info('Database connection closed');
        dbInstance = null;
        resolve();
      }
    });
  });
}
