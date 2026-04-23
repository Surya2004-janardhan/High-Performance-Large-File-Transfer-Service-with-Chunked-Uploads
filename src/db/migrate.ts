import fs from 'fs/promises';
import path from 'path';
import { getDatabase, runQuery } from './client';
import { getLogger } from '../config/logger';

const logger = getLogger();

/**
 * Initialize database schema by executing schema.sql.
 * Idempotent: all CREATE TABLE IF NOT EXISTS statements.
 */
export async function initializeDatabaseSchema(): Promise<void> {
  const schemaPath = path.join(__dirname, 'schema.sql');
  
  try {
    const schema = await fs.readFile(schemaPath, 'utf-8');
    const db = getDatabase();

    // Execute schema SQL statements
    return new Promise((resolve, reject) => {
      db.exec(schema, (err) => {
        if (err) {
          logger.error({ error: err, schemaPath }, 'Failed to initialize database schema');
          reject(err);
        } else {
          logger.info('Database schema initialized');
          resolve();
        }
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message, schemaPath }, 'Failed to read schema file');
    throw error;
  }
}
