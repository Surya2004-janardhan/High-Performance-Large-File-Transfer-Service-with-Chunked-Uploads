import { ValidationError } from '../../shared/errors';
import { InitUploadInput } from './upload.types';

const MIN_FILE_NAME_LENGTH = 1;
const MAX_FILE_NAME_LENGTH = 255;
const MIN_FILE_SIZE = 1024; // 1 KB
const MAX_FILE_SIZE = 1099511627776; // 1 TB
const MIN_CHUNK_SIZE = 1024; // 1 KB

/**
 * Validate init upload payload.
 * Throws ValidationError if invalid.
 */
export function validateInitUploadInput(input: any): asserts input is InitUploadInput {
  if (!input || typeof input !== 'object') {
    throw new ValidationError('Upload payload must be an object');
  }

  const { fileName, fileSize } = input;

  if (typeof fileName !== 'string') {
    throw new ValidationError('fileName must be a string', { field: 'fileName' });
  }

  if (fileName.length < MIN_FILE_NAME_LENGTH || fileName.length > MAX_FILE_NAME_LENGTH) {
    throw new ValidationError(
      `fileName must be between ${MIN_FILE_NAME_LENGTH} and ${MAX_FILE_NAME_LENGTH} characters`,
      { field: 'fileName' }
    );
  }

  // Check for path traversal
  if (fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
    throw new ValidationError('fileName contains invalid characters', { field: 'fileName' });
  }

  if (typeof fileSize !== 'number' || !Number.isInteger(fileSize)) {
    throw new ValidationError('fileSize must be an integer', { field: 'fileSize' });
  }

  if (fileSize < MIN_FILE_SIZE) {
    throw new ValidationError(`fileSize must be at least ${MIN_FILE_SIZE} bytes`, {
      field: 'fileSize'
    });
  }

  if (fileSize > MAX_FILE_SIZE) {
    throw new ValidationError(`fileSize cannot exceed ${MAX_FILE_SIZE} bytes`, {
      field: 'fileSize'
    });
  }
}

/**
 * Validate upload ID format (UUID-like).
 */
export function validateUploadId(uploadId: any): asserts uploadId is string {
  if (typeof uploadId !== 'string') {
    throw new ValidationError('uploadId must be a UUID string', { field: 'uploadId' });
  }

  // Basic UUID v4 format check
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(uploadId)) {
    throw new ValidationError('uploadId must be a valid UUID', { field: 'uploadId' });
  }
}

/**
 * Validate chunk index.
 */
export function validateChunkIndex(chunkIndex: any): asserts chunkIndex is number {
  if (typeof chunkIndex !== 'number' || !Number.isInteger(chunkIndex)) {
    throw new ValidationError('chunkIndex must be an integer', { field: 'chunkIndex' });
  }

  if (chunkIndex < 0) {
    throw new ValidationError('chunkIndex must be >= 0', { field: 'chunkIndex' });
  }
}

/**
 * Validate chunk size (Content-Length).
 */
export function validateChunkSize(
  contentLength: any,
  expectedChunkSize: number,
  isLastChunk: boolean
): asserts contentLength is number {
  if (typeof contentLength !== 'number') {
    throw new ValidationError('Content-Length must be a number', { field: 'Content-Length' });
  }

  if (contentLength <= 0) {
    throw new ValidationError('Content-Length must be > 0', { field: 'Content-Length' });
  }

  // Last chunk can be smaller; others must match expected size
  if (!isLastChunk && contentLength !== expectedChunkSize) {
    throw new ValidationError(
      `Expected chunk size ${expectedChunkSize}, got ${contentLength}`,
      { field: 'Content-Length', expected: expectedChunkSize, actual: contentLength }
    );
  }

  if (contentLength > MAX_FILE_SIZE) {
    throw new ValidationError('Chunk size exceeds maximum allowed', {
      field: 'Content-Length'
    });
  }
}

/**
 * Calculate total chunks for a file.
 */
export function calculateTotalChunks(fileSize: number, chunkSize: number): number {
  return Math.ceil(fileSize / chunkSize);
}
