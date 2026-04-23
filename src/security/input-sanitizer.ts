import { ValidationError } from '../shared/errors';
import path from 'path';

/**
 * Sanitize and validate user-supplied file names.
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName || typeof fileName !== 'string') {
    throw new ValidationError('Invalid file name', { reason: 'file name must be a non-empty string' });
  }

  // Remove path separators and null bytes
  let cleaned = fileName
    .replace(/[\/\\]/g, '')           // Remove forward/back slashes
    .replace(/\0/g, '')               // Remove null bytes
    .replace(/^\s+|\s+$/g, '')        // Trim whitespace
    .substring(0, 255);               // Limit to 255 chars

  if (!cleaned) {
    throw new ValidationError('Invalid file name', { reason: 'file name contains only invalid characters' });
  }

  return cleaned;
}

/**
 * Validate upload ID format (UUID-like).
 */
export function validateUploadIdFormat(uploadId: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uploadId)) {
    throw new ValidationError('Invalid upload ID format', { uploadId });
  }
}

/**
 * Validate file ID format (UUID-like).
 */
export function validateFileIdFormat(fileId: string): void {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(fileId)) {
    throw new ValidationError('Invalid file ID format', { fileId });
  }
}

/**
 * Assert no path traversal in file path.
 */
export function assertNoPathTraversal(input: string): void {
  const normalized = path.normalize(input);
  if (normalized.includes('..') || path.isAbsolute(normalized)) {
    throw new ValidationError('Path traversal detected', { input });
  }
}

/**
 * Validate chunk index is non-negative integer.
 */
export function validateChunkIndexFormat(chunkIndex: any): void {
  const idx = Number(chunkIndex);
  if (!Number.isInteger(idx) || idx < 0) {
    throw new ValidationError('Invalid chunk index', {
      reason: 'chunk index must be a non-negative integer',
      received: chunkIndex
    });
  }
}

/**
 * Validate file size constraints.
 */
export function validateFileSizeConstraints(fileSize: number, maxSizeBytes: number = 1099511627776): void {
  if (fileSize <= 0) {
    throw new ValidationError('Invalid file size', { reason: 'file size must be positive' });
  }
  if (fileSize > maxSizeBytes) {
    throw new ValidationError('File too large', {
      maxBytes: maxSizeBytes,
      received: fileSize
    });
  }
}

/**
 * Validate content length matches chunk boundaries.
 */
export function validateContentLength(contentLength: number, chunkSize: number): void {
  if (contentLength <= 0) {
    throw new ValidationError('Invalid content length', {
      reason: 'content length must be positive'
    });
  }
  if (contentLength > chunkSize) {
    throw new ValidationError('Chunk too large', {
      maxSize: chunkSize,
      received: contentLength
    });
  }
}
