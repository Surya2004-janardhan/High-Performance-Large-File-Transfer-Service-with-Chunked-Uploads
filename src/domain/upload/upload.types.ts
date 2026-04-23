import { UploadStatus } from './upload.enums';

/**
 * Domain model for an upload session.
 */
export interface UploadSession {
  id: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  status: UploadStatus;
  createdAt: Date;
  completedAt?: Date;
  fileId?: string;
}

/**
 * Domain model for a chunk record.
 */
export interface ChunkRecord {
  uploadId: string;
  chunkIndex: number;
  size: number;
  etag?: string;
}

/**
 * Domain model for a file after completion.
 */
export interface FileRecord {
  id: string;
  uploadId: string;
  fileName: string;
  fileSize: number;
  mimeType?: string;
  createdAt: Date;
}

/**
 * Request payload for initializing an upload.
 */
export interface InitUploadInput {
  fileName: string;
  fileSize: number;
}

/**
 * Response payload after upload initialization.
 */
export interface InitUploadOutput {
  uploadId: string;
  chunkSize: number;
}
