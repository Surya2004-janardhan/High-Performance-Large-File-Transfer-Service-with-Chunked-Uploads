/**
 * Shared domain types and interfaces.
 */

export interface Upload {
  id: string;
  fileName: string;
  fileSize: number;
  chunkSize: number;
  totalChunks: number;
  status: 'PENDING' | 'UPLOADING' | 'COMPLETED' | 'EXPIRED';
  createdAt: string; // ISO8601
  completedAt?: string; // ISO8601
}

export interface Chunk {
  uploadId: string;
  chunkIndex: number;
  size: number;
  etag?: string;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  database: 'connected' | 'disconnected';
  storage: 'connected' | 'disconnected';
  timestamp: string;
}

export interface UploadInitRequest {
  fileName: string;
  fileSize: number;
}

export interface UploadInitResponse {
  uploadId: string;
  chunkSize: number;
}

export interface UploadChunkResponse {
  chunkIndex: number;
  uploadId: string;
}

export interface UploadStatusResponse {
  uploadedChunks: number[];
}

export interface UploadCompleteResponse {
  fileId: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
}
