import { v4 as uuidv4 } from 'uuid';
import { Readable } from 'stream';
import {
  getUploadRepository,
  getChunkRepository,
  getFileRepository
} from '../repositories/index';
import { UploadStatus } from '../domain/upload/upload.enums';
import {
  validateInitUploadInput,
  validateUploadId,
  validateChunkIndex,
  validateChunkSize,
  calculateTotalChunks
} from '../domain/upload/upload.validators';
import { InitUploadInput, InitUploadOutput, UploadSession } from '../domain/upload/upload.types';
import { StorageAdapter } from '../storage/storage.types';
import { NotFoundError, ValidationError, ConflictError } from '../shared/errors';
import { AssemblyService } from './assembly.service';
import { getLogger } from '../config/logger';
import { withTransaction } from '../db/transaction';

const logger = getLogger();

/**
 * Upload service: orchestrates upload lifecycle.
 * Handles initialization, chunk storage, status tracking, completion, and cancellation.
 */
export class UploadService {
  private uploadRepo = getUploadRepository();
  private chunkRepo = getChunkRepository();
  private fileRepo = getFileRepository();
  private assemblyService: AssemblyService;

  constructor(private storageAdapter: StorageAdapter, private chunkSize: number) {
    this.assemblyService = new AssemblyService(storageAdapter, fileRepo, chunkRepo);
  }

  /**
   * Initialize a new upload session.
   */
  async initializeUploadSession(input: InitUploadInput): Promise<InitUploadOutput> {
    // Validate request
    validateInitUploadInput(input);

    const uploadId = uuidv4();
    const totalChunks = calculateTotalChunks(input.fileSize, this.chunkSize);

    logger.info(
      { uploadId, fileName: input.fileName, fileSize: input.fileSize, totalChunks },
      'Initializing upload session'
    );

    // Create upload record
    await this.uploadRepo.createUploadSession(
      uploadId,
      input.fileName,
      input.fileSize,
      this.chunkSize,
      totalChunks
    );

    return {
      uploadId,
      chunkSize: this.chunkSize
    };
  }

  /**
   * Store an incoming chunk (idempotent).
   */
  async storeChunk(
    uploadId: string,
    chunkIndex: number,
    stream: Readable,
    contentLength: number
  ): Promise<void> {
    // Validate inputs
    validateUploadId(uploadId);
    validateChunkIndex(chunkIndex);

    // Fetch upload session
    const upload = await this.uploadRepo.getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError('Upload not found', { uploadId });
    }

    // Validate chunk index against total chunks
    if (chunkIndex >= upload.totalChunks) {
      throw new ValidationError('Chunk index out of range', {
        chunkIndex,
        totalChunks: upload.totalChunks
      });
    }

    // Validate chunk size
    const isLastChunk = chunkIndex === upload.totalChunks - 1;
    validateChunkSize(contentLength, this.chunkSize, isLastChunk);

    // Check if chunk already exists (idempotency)
    const exists = await this.chunkRepo.chunkExists(uploadId, chunkIndex);
    if (exists) {
      logger.debug({ uploadId, chunkIndex }, 'Chunk already exists, skipping upload');
      return;
    }

    logger.debug({ uploadId, chunkIndex }, 'Storing chunk');

    try {
      await withTransaction(async () => {
        // Store chunk in object storage
        const result = await this.storageAdapter.putChunkObject(
          uploadId,
          chunkIndex,
          stream,
          contentLength,
          'application/octet-stream'
        );

        // Record chunk in database
        await this.chunkRepo.upsertChunkRecord(uploadId, chunkIndex, contentLength, result.etag);

        // Update upload status to UPLOADING if not already
        if (upload.status === UploadStatus.PENDING) {
          await this.uploadRepo.updateUploadStatus(uploadId, UploadStatus.UPLOADING);
        }
      });

      logger.info({ uploadId, chunkIndex }, 'Chunk stored successfully');
    } catch (error) {
      logger.error({ uploadId, chunkIndex, error }, 'Failed to store chunk');
      throw error;
    }
  }

  /**
   * Get upload status including list of uploaded chunk indices.
   */
  async getUploadStatus(uploadId: string): Promise<{ uploadedChunks: number[] }> {
    validateUploadId(uploadId);

    // Fetch upload
    const upload = await this.uploadRepo.getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError('Upload not found', { uploadId });
    }

    // Get uploaded chunk indices
    const uploadedChunks = await this.chunkRepo.listUploadedChunkIndices(uploadId);

    return { uploadedChunks };
  }

  /**
   * Complete an upload by assembling all chunks into final file.
   */
  async completeUpload(uploadId: string): Promise<{
    fileId: string;
    fileName: string;
    fileSize: number;
    mimeType: string;
  }> {
    validateUploadId(uploadId);

    const upload = await this.uploadRepo.getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError('Upload not found', { uploadId });
    }

    if (upload.status === UploadStatus.COMPLETED) {
      throw new ConflictError('Upload already completed', { uploadId });
    }

    logger.info({ uploadId, totalChunks: upload.totalChunks }, 'Completing upload');

    // Verify all chunks are present
    const uploadedChunks = await this.chunkRepo.listUploadedChunkIndices(uploadId);
    const expectedChunks = Array.from({ length: upload.totalChunks }, (_, i) => i);

    if (uploadedChunks.length !== expectedChunks.length) {
      throw new ValidationError('Not all chunks uploaded', {
        uploadId,
        expected: expectedChunks.length,
        actual: uploadedChunks.length,
        missing: expectedChunks.filter(i => !uploadedChunks.includes(i))
      });
    }

    try {
      // Assemble chunks into final file
      const fileId = uuidv4();
      await this.assemblyService.assembleAndStore(
        fileId,
        uploadId,
        upload.fileName,
        upload.fileSize,
        upload.totalChunks
      );

      // Mark upload as completed
      await this.uploadRepo.markUploadCompleted(uploadId, fileId);

      logger.info({ uploadId, fileId }, 'Upload completed successfully');

      return {
        fileId,
        fileName: upload.fileName,
        fileSize: upload.fileSize,
        mimeType: this.getMimeType(upload.fileName)
      };
    } catch (error) {
      logger.error({ uploadId, error }, 'Failed to complete upload');
      throw error;
    }
  }

  /**
   * Cancel an upload and clean up all associated data.
   */
  async cancelUpload(uploadId: string): Promise<void> {
    validateUploadId(uploadId);

    const upload = await this.uploadRepo.getUploadById(uploadId);
    if (!upload) {
      throw new NotFoundError('Upload not found', { uploadId });
    }

    if (upload.status === UploadStatus.COMPLETED) {
      throw new ConflictError('Cannot cancel completed upload', { uploadId });
    }

    logger.info({ uploadId }, 'Canceling upload');

    try {
      await withTransaction(async () => {
        // Delete chunks from storage
        await this.storageAdapter.deleteChunkObjects(uploadId);

        // Delete chunk records
        await this.chunkRepo.deleteChunksByUploadId(uploadId);

        // Delete upload record
        await this.uploadRepo.deleteUpload(uploadId);
      });

      logger.info({ uploadId }, 'Upload canceled successfully');
    } catch (error) {
      logger.error({ uploadId, error }, 'Failed to cancel upload');
      throw error;
    }
  }

  /**
   * Infer MIME type from filename.
   */
  private getMimeType(fileName: string): string {
    const ext = fileName.split('.').pop()?.toLowerCase() || '';
    const mimeTypes: Record<string, string> = {
      pdf: 'application/pdf',
      txt: 'text/plain',
      json: 'application/json',
      xml: 'application/xml',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      zip: 'application/zip',
      tar: 'application/x-tar',
      gz: 'application/gzip'
    };
    return mimeTypes[ext] || 'application/octet-stream';
  }
}
