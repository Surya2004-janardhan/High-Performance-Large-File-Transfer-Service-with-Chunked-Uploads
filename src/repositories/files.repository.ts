import { getOne, runQuery } from '../db/client';
import { FileRecord } from '../domain/upload/upload.types';
import { DatabaseError } from '../shared/errors';

/**
 * Repository for managing file records after upload completion.
 */
export class FileRepository {
  /**
   * Create a file record for a completed upload.
   */
  async createFileRecord(
    fileId: string,
    uploadId: string,
    fileName: string,
    fileSize: number,
    mimeType?: string
  ): Promise<FileRecord> {
    const createdAt = new Date().toISOString();

    try {
      await runQuery(
        `INSERT INTO files (id, upload_id, file_name, file_size, mime_type, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [fileId, uploadId, fileName, fileSize, mimeType || null, createdAt]
      );

      return {
        id: fileId,
        uploadId,
        fileName,
        fileSize,
        mimeType,
        createdAt: new Date(createdAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to create file record', { fileId, uploadId });
    }
  }

  /**
   * Get a file record by file ID.
   */
  async getFileById(fileId: string): Promise<FileRecord | undefined> {
    try {
      const row = await getOne<any>(
        `SELECT id, upload_id as uploadId, file_name as fileName, file_size as fileSize,
                mime_type as mimeType, created_at as createdAt
         FROM files WHERE id = ?`,
        [fileId]
      );

      if (!row) {
        return undefined;
      }

      return {
        id: row.id,
        uploadId: row.uploadId,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        createdAt: new Date(row.createdAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to get file', { fileId });
    }
  }

  /**
   * Get file by upload ID.
   */
  async getFileByUploadId(uploadId: string): Promise<FileRecord | undefined> {
    try {
      const row = await getOne<any>(
        `SELECT id, upload_id as uploadId, file_name as fileName, file_size as fileSize,
                mime_type as mimeType, created_at as createdAt
         FROM files WHERE upload_id = ?`,
        [uploadId]
      );

      if (!row) {
        return undefined;
      }

      return {
        id: row.id,
        uploadId: row.uploadId,
        fileName: row.fileName,
        fileSize: row.fileSize,
        mimeType: row.mimeType,
        createdAt: new Date(row.createdAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to get file by upload', { uploadId });
    }
  }

  /**
   * Delete a file record.
   */
  async deleteFile(fileId: string): Promise<void> {
    try {
      await runQuery(`DELETE FROM files WHERE id = ?`, [fileId]);
    } catch (error) {
      throw new DatabaseError('Failed to delete file', { fileId });
    }
  }
}
