import { getDatabase } from './client';
import { getLogger } from '../config/logger';

const logger = getLogger();

/**
 * Transaction helper for atomic database operations.
 * Ensures all-or-nothing execution.
 */
export async function withTransaction<T>(
  fn: () => Promise<T>
): Promise<T> {
  const db = getDatabase();

  return new Promise(async (resolve, reject) => {
    // Begin transaction
    db.run('BEGIN TRANSACTION', async (err) => {
      if (err) {
        logger.error({ error: err }, 'Failed to begin transaction');
        return reject(err);
      }

      try {
        // Execute the transaction function
        const result = await fn();

        // Commit on success
        db.run('COMMIT', (commitErr) => {
          if (commitErr) {
            logger.error({ error: commitErr }, 'Failed to commit transaction');
            reject(commitErr);
          } else {
            resolve(result);
          }
        });
      } catch (error) {
        // Rollback on error
        db.run('ROLLBACK', (rollbackErr) => {
          if (rollbackErr) {
            logger.error({ error: rollbackErr }, 'Failed to rollback transaction');
          }
          reject(error);
        });
      }
    });
  });
}
