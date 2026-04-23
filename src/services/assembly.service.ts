import { pipeline } from 'stream/promises';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getChunkRepository } from '../repositories/index';
import { StorageAdapter } from '../storage/storage.types';
import { getLogger } from '../config/logger';
import { ValidationError } from '../shared/errors';

const logger = getLogger();

/**
 * Assembly service: handles memory-efficient file assembly from chunks.
 * Uses stream pipeline with backpressure handling.
 * Temp file + atomic promote pattern for safety.
 */
export class AssemblyService {
  private chunkRepo = getChunkRepository();

  constructor(
    private storageAdapter: StorageAdapter,
    private fileRepo: any
  ) {}

  /**
   * Assemble chunks and store as final file.
   * Uses temp file first, then promotes to permanent storage.
   */
  async assembleAndStore(
    fileId: string,
    uploadId: string,
    fileName: string,
    fileSize: number,
    totalChunks: number
  ): Promise<void> {
    // Create temp directory in OS temp location
    const tempDir = path.join(os.tmpdir(), 'lft-assembly');
    const tempFilePath = path.join(tempDir, `${uploadId}-${fileId}.tmp`);

    try {
      // Ensure temp directory exists
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      logger.debug({ tempFilePath }, 'Assembling chunks to temporary file');

      // Stream chunks to temp file with backpressure handling
      const writeStream = fs.createWriteStream(tempFilePath);

      for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
        const chunkStream = await this.storageAdapter.getChunkReadStream(uploadId, chunkIndex);

        // Pipeline ensures backpressure is respected
        // If write is slow, read pauses automatically
        await pipeline(chunkStream, writeStream, { end: false });

        logger.debug(
          { uploadId, chunkIndex, totalChunks },
          `Chunk ${chunkIndex} assembled`
        );
      }

      // End write stream and wait for completion
      await new Promise<void>((resolve, reject) => {
        writeStream.end();
        writeStream.on('finish', () => resolve());
        writeStream.on('error', reject);
      });

      // Verify assembled file size
      const stat = fs.statSync(tempFilePath);
      if (stat.size !== fileSize) {
        throw new ValidationError('Assembled file size mismatch', {
          expected: fileSize,
          actual: stat.size,
          uploadId,
          fileId
        });
      }

      logger.debug(
        { tempFilePath, fileSize },
        'Chunks assembled, promoting to permanent storage'
      );

      // Promote temp file to final storage (atomic)
      const readStream = fs.createReadStream(tempFilePath);
      await this.storageAdapter.putFinalFileObject(
        fileId,
        readStream,
        fileSize,
        'application/octet-stream',
        { 'x-upload-id': uploadId, 'x-original-name': fileName }
      );

      // Create file record in database
      await this.fileRepo.createFileRecord(fileId, uploadId, fileName, fileSize);

      logger.info({ fileId, uploadId, fileSize }, 'File assembly and promotion complete');
    } catch (error) {
      logger.error({ uploadId, fileId, error }, 'Assembly failed, cleaning up');

      // Clean up temp file if it exists
      try {
        if (fs.existsSync(tempFilePath)) {
          fs.unlinkSync(tempFilePath);
        }
      } catch (cleanupError) {
        logger.error({ tempFilePath, cleanupError }, 'Failed to clean up temp file');
      }

      throw error;
    }
  }

  /**
   * Verify all chunks are present in storage.
   */
  async verifyAllChunksPresent(uploadId: string, totalChunks: number): Promise<boolean> {
    const uploadedChunks = await this.chunkRepo.listUploadedChunkIndices(uploadId);
    const expectedChunks = Array.from({ length: totalChunks }, (_, i) => i);

    return (
      uploadedChunks.length === expectedChunks.length &&
      uploadedChunks.every((idx: number) => expectedChunks.includes(idx))
    );
  }
}
