/**
 * Upload domain enums.
 */

export enum UploadStatus {
  PENDING = 'PENDING',
  UPLOADING = 'UPLOADING',
  COMPLETED = 'COMPLETED',
  EXPIRED = 'EXPIRED'
}

export const VALID_UPLOAD_STATUSES = Object.values(UploadStatus);
