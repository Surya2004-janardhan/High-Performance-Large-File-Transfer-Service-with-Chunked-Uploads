import { Readable } from 'stream';

/**
 * Abstract storage adapter interface.
 * Implementation can be MinIO, AWS S3, local filesystem, etc.
 */
export interface StorageAdapter {
  /**
   * Ensure bucket exists; create if not.
   */
  ensureBucketExists(bucketName: string): Promise<void>;

  /**
   * Store a chunk object.
   */
  putChunkObject(
    uploadId: string,
    chunkIndex: number,
    stream: Readable,
    size: number,
    contentType?: string
  ): Promise<{ etag?: string }>;

  /**
   * Check if chunk object exists.
   */
  chunkObjectExists(uploadId: string, chunkIndex: number): Promise<boolean>;

  /**
   * List all chunk object indices for an upload.
   */
  listChunkObjects(uploadId: string): Promise<number[]>;

  /**
   * Get a readable stream for a chunk.
   */
  getChunkReadStream(uploadId: string, chunkIndex: number): Promise<Readable>;

  /**
   * Store the final assembled file.
   */
  putFinalFileObject(
    fileId: string,
    stream: Readable,
    size: number,
    mimeType?: string,
    metadata?: Record<string, string>
  ): Promise<{ etag?: string }>;

  /**
   * Get readable stream for final file.
   */
  getFinalFileReadStream(fileId: string): Promise<Readable>;

  /**
   * Delete all chunk objects for an upload.
   */
  deleteChunkObjects(uploadId: string): Promise<void>;

  /**
   * Delete a final file object.
   */
  deleteFinalFileObject(fileId: string): Promise<void>;

  /**
   * Get file metadata (size, last modified, etc).
   */
  getFileMetadata(fileId: string): Promise<{ size: number; etag?: string } | undefined>;
}

/**
 * Storage configuration options.
 */
export interface StorageConfig {
  endpoint: string;
  port: number;
  accessKey: string;
  secretKey: string;
  bucketName: string;
  useSSL: boolean;
}
