import { getUploadRepository } from '../repositories/index';
import { UploadStatus } from '../domain/upload/upload.enums';
import { getLogger } from '../config/logger';
import { withTransaction } from '../db/transaction';

const logger = getLogger();

/**
 * Cleanup worker for stale uploads.
 * Placeholder implementation for Phase 4.
 * Will be fully implemented with: expiration, chunk deletion from storage.
 */
export class CleanupWorker {
  private uploadRepo = getUploadRepository();
  private interval: NodeJS.Timer | null = null;

  constructor(
    private staleAfterMinutes: number = 1440,
    private intervalSeconds: number = 3600
  ) {}

  /**
   * Start cleanup worker (periodic cleanup).
   */
  start(): void {
    logger.info(
      { staleAfterMinutes: this.staleAfterMinutes, intervalSeconds: this.intervalSeconds },
      'Starting cleanup worker'
    );

    this.interval = setInterval(() => {
      this.runCleanupNow().catch(err => {
        logger.error({ error: err }, 'Cleanup worker error');
      });
    }, this.intervalSeconds * 1000);
  }

  /**
   * Stop cleanup worker.
   */
  stop(): void {
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
      logger.info('Cleanup worker stopped');
    }
  }

  /**
   * Run cleanup immediately.
   * Find stale incomplete uploads and mark as EXPIRED.
   */
  async runCleanupNow(): Promise<{ expiredUploads: number; deletedChunks: number }> {
    const staleBeforeDate = new Date(Date.now() - this.staleAfterMinutes * 60 * 1000);

    logger.info({ staleBeforeDate }, 'Running cleanup');

    try {
      // Find stale uploads
      const staleUploads = await this.uploadRepo.listStaleUploads(staleBeforeDate, [
        UploadStatus.PENDING,
        UploadStatus.UPLOADING
      ]);

      if (staleUploads.length === 0) {
        logger.debug('No stale uploads found');
        return { expiredUploads: 0, deletedChunks: 0 };
      }

      logger.info({ count: staleUploads.length }, 'Found stale uploads');

      // Mark each as EXPIRED (Phase 4 will add storage cleanup)
      let expiredCount = 0;
      for (const upload of staleUploads) {
        try {
          await withTransaction(async () => {
            await this.uploadRepo.updateUploadStatus(upload.id, UploadStatus.EXPIRED);
          });
          expiredCount++;
        } catch (error) {
          logger.error({ uploadId: upload.id, error }, 'Failed to expire upload');
        }
      }

      logger.info({ expiredCount }, 'Cleanup completed');
      return { expiredUploads: expiredCount, deletedChunks: 0 };
    } catch (error) {
      logger.error({ error }, 'Cleanup worker failed');
      throw error;
    }
  }
}
