import { getFileRepository } from '../repositories/index';
import { NotFoundError, StorageError } from '../shared/errors';
import { getLogger } from '../config/logger';
import { Readable } from 'stream';
import { StorageAdapter } from '../storage/storage.types';

const logger = getLogger();

/**
 * Download service: handles file streaming and download operations.
 */
export class DownloadService {
  private fileRepo = getFileRepository();

  /**
   * Get download metadata for a file.
   */
  async getDownloadDescriptor(fileId: string) {
    const fileRecord = await this.fileRepo.getFileById(fileId);
    if (!fileRecord) {
      throw new NotFoundError(`File not found: ${fileId}`, { fileId });
    }
    return fileRecord;
  }

  /**
   * Create a readable stream for file download from storage.
   */
  async createDownloadReadStream(
    fileId: string,
    storageAdapter: StorageAdapter
  ): Promise<Readable> {
    try {
      const stream = await storageAdapter.getFinalFileReadStream(fileId);
      return stream;
    } catch (error) {
      logger.error({ fileId, error }, 'Failed to create download stream');
      throw new StorageError('Failed to create download stream', { fileId });
    }
  }

  /**
   * Build Content-Disposition header value.
   */
  buildContentDisposition(fileName: string): string {
    const encoded = encodeURIComponent(fileName);
    return `attachment; filename="${encoded}"`;
  }

  /**
   * Resolve MIME type from file extension.
   */
  resolveMimeType(fileName: string, fallback: string = 'application/octet-stream'): string {
    const ext = fileName.split('.').pop()?.toLowerCase();
    const mimeMap: Record<string, string> = {
      'pdf': 'application/pdf',
      'txt': 'text/plain',
      'json': 'application/json',
      'xml': 'application/xml',
      'html': 'text/html',
      'css': 'text/css',
      'js': 'application/javascript',
      'png': 'image/png',
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'gif': 'image/gif',
      'svg': 'image/svg+xml',
      'mp4': 'video/mp4',
      'mp3': 'audio/mpeg',
      'zip': 'application/zip',
      'tar': 'application/x-tar',
      'gzip': 'application/gzip'
    };
    return mimeMap[ext || ''] || fallback;
  }
}
