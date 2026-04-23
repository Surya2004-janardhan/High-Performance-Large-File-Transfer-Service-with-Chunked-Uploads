import { getUploadRepository } from '../repositories/index';
import { UploadStatus } from '../domain/upload/upload.enums';
import { getLogger } from '../config/logger';
import { StorageAdapter } from '../storage/storage.types';

const logger = getLogger();

/**
 * Cleanup service: handles expiration of stale incomplete uploads.
 */
export class CleanupService {
  private uploadRepo = getUploadRepository();

  /**
   * Find uploads older than threshold with PENDING or UPLOADING status.
   */
  async findStaleUploads(staleMinutes: number): Promise<string[]> {
    const now = new Date();
    const thresholdTime = new Date(now.getTime() - staleMinutes * 60 * 1000);

    logger.info(
      { staleMinutes, thresholdTime },
      'Finding stale uploads'
    );

    const staleUploads = await this.uploadRepo.listStaleUploads(
      thresholdTime,
      [UploadStatus.PENDING, UploadStatus.UPLOADING]
    );

    return staleUploads.map(u => u.id);
  }

  /**
   * Expire a single upload: mark as EXPIRED and clean up stored chunks.
   */
  async expireUpload(uploadId: string, storageAdapter: StorageAdapter): Promise<void> {
    logger.info({ uploadId }, 'Expiring upload');

    try {
      // Delete chunk files from storage
      await storageAdapter.deleteChunkObjects(uploadId);

      // Update upload status to EXPIRED
      await this.uploadRepo.updateUploadStatus(uploadId, UploadStatus.EXPIRED);

      logger.info({ uploadId }, 'Upload expired successfully');
    } catch (error) {
      logger.error({ uploadId, error }, 'Error expiring upload');
      throw error;
    }
  }

  /**
   * Run cleanup for all stale uploads.
   */
  async runCleanup(staleMinutes: number, storageAdapter: StorageAdapter): Promise<{ expiredCount: number; errors: string[] }> {
    logger.info('Starting cleanup of stale uploads');

    const expiredCount = 0;
    const errors: string[] = [];

    try {
      const staleUploadIds = await this.findStaleUploads(staleMinutes);

      logger.info({ count: staleUploadIds.length }, 'Found stale uploads');

      for (const uploadId of staleUploadIds) {
        try {
          await this.expireUpload(uploadId, storageAdapter);
          expiredCount;
        } catch (error) {
          const msg = error instanceof Error ? error.message : String(error);
          errors.push(`Failed to expire ${uploadId}: ${msg}`);
          logger.error({ uploadId, error }, 'Error expiring individual upload');
        }
      }

      logger.info({ expiredCount, errorCount: errors.length }, 'Cleanup completed');
      return { expiredCount: staleUploadIds.length, errors };
    } catch (error) {
      logger.error({ error }, 'Cleanup failed');
      throw error;
    }
  }
}
