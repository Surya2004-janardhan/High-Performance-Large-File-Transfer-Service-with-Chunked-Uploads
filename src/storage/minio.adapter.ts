import { Client as MinioClient } from 'minio';
import { Readable } from 'stream';
import { StorageAdapter, StorageConfig } from './storage.types';
import { StorageError } from '../shared/errors';
import { getLogger } from '../config/logger';

const logger = getLogger();

/**
 * MinIO S3-compatible storage adapter implementation.
 */
export class MinIOAdapter implements StorageAdapter {
  private client: MinioClient;
  private bucketName: string;

  constructor(config: StorageConfig) {
    this.bucketName = config.bucketName;

    this.client = new MinioClient({
      endPoint: config.endpoint,
      port: config.port,
      accessKey: config.accessKey,
      secretKey: config.secretKey,
      useSSL: config.useSSL || false
    });
  }

  /**
   * Ensure bucket exists; create if not.
   */
  async ensureBucketExists(bucketName: string): Promise<void> {
    try {
      const exists = await this.client.bucketExists(bucketName);
      if (!exists) {
        await this.client.makeBucket(bucketName, 'us-east-1');
        logger.info({ bucketName }, 'Created MinIO bucket');
      } else {
        logger.debug({ bucketName }, 'MinIO bucket exists');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, bucketName }, 'Failed to ensure bucket exists');
      throw new StorageError(`Failed to ensure bucket exists: ${message}`);
    }
  }

  /**
   * Store a chunk object.
   */
  async putChunkObject(
    uploadId: string,
    chunkIndex: number,
    stream: Readable,
    size: number,
    contentType?: string
  ): Promise<{ etag?: string }> {
    const objectName = this.getChunkPath(uploadId, chunkIndex);

    try {
      const result = await this.client.putObject(
        this.bucketName,
        objectName,
        stream,
        size,
        { 'Content-Type': contentType || 'application/octet-stream' }
      );

      logger.debug({ uploadId, chunkIndex, objectName }, 'Chunk stored');
      return { etag: result.etag };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, uploadId, chunkIndex, objectName },
        'Failed to store chunk'
      );
      throw new StorageError(`Failed to store chunk: ${message}`);
    }
  }

  /**
   * Check if chunk object exists.
   */
  async chunkObjectExists(uploadId: string, chunkIndex: number): Promise<boolean> {
    const objectName = this.getChunkPath(uploadId, chunkIndex);

    try {
      const stat = await this.client.statObject(this.bucketName, objectName);
      return !!stat;
    } catch (error: any) {
      // NotFound error is expected; return false
      if (error.code === 'NotFound' || error.message?.includes('NotFound')) {
        return false;
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, uploadId, chunkIndex, objectName },
        'Failed to check chunk existence'
      );
      throw new StorageError(`Failed to check chunk existence: ${message}`);
    }
  }

  /**
   * List all chunk object indices for an upload.
   */
  async listChunkObjects(uploadId: string): Promise<number[]> {
    const prefix = `uploads/${uploadId}/chunks/`;
    const indices: number[] = [];

    try {
      const objectsStream = this.client.listObjects(this.bucketName, prefix, false);

      return new Promise((resolve, reject) => {
        objectsStream.on('data', (obj) => {
          // Extract chunk index from object name: uploads/{uploadId}/chunks/{chunkIndex}
          const match = obj.name.match(/chunks\/(\d+)$/);
          if (match) {
            indices.push(parseInt(match[1], 10));
          }
        });

        objectsStream.on('error', (err) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ error: message, uploadId }, 'Failed to list chunks');
          reject(new StorageError(`Failed to list chunks: ${message}`));
        });

        objectsStream.on('end', () => {
          resolve(indices.sort((a, b) => a - b));
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, uploadId }, 'Failed to list chunks');
      throw new StorageError(`Failed to list chunks: ${message}`);
    }
  }

  /**
   * Get readable stream for a chunk.
   */
  async getChunkReadStream(uploadId: string, chunkIndex: number): Promise<Readable> {
    const objectName = this.getChunkPath(uploadId, chunkIndex);

    try {
      const stream = await this.client.getObject(this.bucketName, objectName);
      return stream as unknown as Readable;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error(
        { error: message, uploadId, chunkIndex, objectName },
        'Failed to get chunk stream'
      );
      throw new StorageError(`Failed to get chunk stream: ${message}`);
    }
  }

  /**
   * Store final assembled file.
   */
  async putFinalFileObject(
    fileId: string,
    stream: Readable,
    size: number,
    mimeType?: string,
    metadata?: Record<string, string>
  ): Promise<{ etag?: string }> {
    const objectName = `files/${fileId}`;

    try {
      const result = await this.client.putObject(
        this.bucketName,
        objectName,
        stream,
        size,
        {
          'Content-Type': mimeType || 'application/octet-stream',
          ...metadata
        }
      );

      logger.debug({ fileId, objectName }, 'File object stored');
      return { etag: result.etag };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, fileId, objectName }, 'Failed to store file object');
      throw new StorageError(`Failed to store file object: ${message}`);
    }
  }

  /**
   * Get readable stream for final file.
   */
  async getFinalFileReadStream(fileId: string): Promise<Readable> {
    const objectName = `files/${fileId}`;

    try {
      const stream = await this.client.getObject(this.bucketName, objectName);
      return stream as unknown as Readable;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, fileId, objectName }, 'Failed to get file stream');
      throw new StorageError(`Failed to get file stream: ${message}`);
    }
  }

  /**
   * Delete all chunk objects for an upload.
   */
  async deleteChunkObjects(uploadId: string): Promise<void> {
    const prefix = `uploads/${uploadId}/chunks/`;

    try {
      const objectsToDelete: string[] = [];
      const objectsStream = this.client.listObjects(this.bucketName, prefix, false);

      return new Promise((resolve, reject) => {
        objectsStream.on('data', (obj) => {
          objectsToDelete.push(obj.name);
        });

        objectsStream.on('error', (err) => {
          const message = err instanceof Error ? err.message : String(err);
          logger.error({ error: message, uploadId }, 'Failed to list chunks for deletion');
          reject(new StorageError(`Failed to list chunks for deletion: ${message}`));
        });

        objectsStream.on('end', async () => {
          if (objectsToDelete.length === 0) {
            return resolve();
          }

          try {
            await this.client.removeObjects(this.bucketName, objectsToDelete);
            logger.debug({ uploadId, count: objectsToDelete.length }, 'Deleted chunk objects');
            resolve();
          } catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            logger.error(
              { error: message, uploadId, count: objectsToDelete.length },
              'Failed to delete chunk objects'
            );
            reject(new StorageError(`Failed to delete chunk objects: ${message}`));
          }
        });
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, uploadId }, 'Failed to delete chunks');
      throw new StorageError(`Failed to delete chunks: ${message}`);
    }
  }

  /**
   * Delete a final file object.
   */
  async deleteFinalFileObject(fileId: string): Promise<void> {
    const objectName = `files/${fileId}`;

    try {
      await this.client.removeObject(this.bucketName, objectName);
      logger.debug({ fileId, objectName }, 'File object deleted');
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, fileId, objectName }, 'Failed to delete file object');
      throw new StorageError(`Failed to delete file object: ${message}`);
    }
  }

  /**
   * Get file metadata.
   */
  async getFileMetadata(fileId: string): Promise<{ size: number; etag?: string } | undefined> {
    const objectName = `files/${fileId}`;

    try {
      const stat = await this.client.statObject(this.bucketName, objectName);
      return { size: stat.size, etag: stat.etag };
    } catch (error: any) {
      if (error.code === 'NotFound' || error.message?.includes('NotFound')) {
        return undefined;
      }

      const message = error instanceof Error ? error.message : String(error);
      logger.error({ error: message, fileId, objectName }, 'Failed to get file metadata');
      throw new StorageError(`Failed to get file metadata: ${message}`);
    }
  }

  /**
   * Construct chunk object path.
   */
  private getChunkPath(uploadId: string, chunkIndex: number): string {
    return `uploads/${uploadId}/chunks/${chunkIndex}`;
  }
}
