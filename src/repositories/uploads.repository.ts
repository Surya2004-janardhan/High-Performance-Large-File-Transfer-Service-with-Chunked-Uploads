import { getAll, getOne, runQuery } from '../db/client';
import { UploadSession } from '../domain/upload/upload.types';
import { UploadStatus } from '../domain/upload/upload.enums';
import { DatabaseError } from '../shared/errors';

/**
 * Repository for managing upload sessions.
 */
export class UploadRepository {
  /**
   * Create a new upload session.
   */
  async createUploadSession(
    id: string,
    fileName: string,
    fileSize: number,
    chunkSize: number,
    totalChunks: number
  ): Promise<UploadSession> {
    const createdAt = new Date().toISOString();

    try {
      await runQuery(
        `INSERT INTO uploads (id, file_name, file_size, chunk_size, total_chunks, status, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [id, fileName, fileSize, chunkSize, totalChunks, UploadStatus.PENDING, createdAt]
      );

      return {
        id,
        fileName,
        fileSize,
        chunkSize,
        totalChunks,
        status: UploadStatus.PENDING,
        createdAt: new Date(createdAt)
      };
    } catch (error) {
      throw new DatabaseError('Failed to create upload session', { uploadId: id });
    }
  }

  /**
   * Get an upload session by ID.
   */
  async getUploadById(uploadId: string): Promise<UploadSession | undefined> {
    try {
      const row = await getOne<any>(
        `SELECT id, file_name as fileName, file_size as fileSize, chunk_size as chunkSize,
                total_chunks as totalChunks, status, created_at as createdAt, completed_at as completedAt,
                file_id as fileId
         FROM uploads WHERE id = ?`,
        [uploadId]
      );

      if (!row) {
        return undefined;
      }

      return {
        id: row.id,
        fileName: row.fileName,
        fileSize: row.fileSize,
        chunkSize: row.chunkSize,
        totalChunks: row.totalChunks,
        status: row.status as UploadStatus,
        createdAt: new Date(row.createdAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
        fileId: row.fileId
      };
    } catch (error) {
      throw new DatabaseError('Failed to fetch upload', { uploadId });
    }
  }

  /**
   * Update upload status.
   */
  async updateUploadStatus(uploadId: string, status: UploadStatus): Promise<void> {
    try {
      await runQuery(`UPDATE uploads SET status = ? WHERE id = ?`, [status, uploadId]);
    } catch (error) {
      throw new DatabaseError('Failed to update upload status', { uploadId, status });
    }
  }

  /**
   * Mark upload as completed with fileId.
   */
  async markUploadCompleted(uploadId: string, fileId: string): Promise<void> {
    const completedAt = new Date().toISOString();

    try {
      await runQuery(
        `UPDATE uploads SET status = ?, completed_at = ?, file_id = ? WHERE id = ?`,
        [UploadStatus.COMPLETED, completedAt, fileId, uploadId]
      );
    } catch (error) {
      throw new DatabaseError('Failed to mark upload completed', { uploadId, fileId });
    }
  }

  /**
   * List uploads that are stale (older than threshold, not completed).
   */
  async listStaleUploads(staleBeforeDate: Date, statuses: UploadStatus[]): Promise<UploadSession[]> {
    const beforeIso = staleBeforeDate.toISOString();
    const placeholders = statuses.map(() => '?').join(',');

    try {
      const rows = await getAll<any>(
        `SELECT id, file_name as fileName, file_size as fileSize, chunk_size as chunkSize,
                total_chunks as totalChunks, status, created_at as createdAt, completed_at as completedAt,
                file_id as fileId
         FROM uploads
         WHERE created_at < ? AND status IN (${placeholders})
         ORDER BY created_at ASC`,
        [beforeIso, ...statuses]
      );

      return rows.map(row => ({
        id: row.id,
        fileName: row.fileName,
        fileSize: row.fileSize,
        chunkSize: row.chunkSize,
        totalChunks: row.totalChunks,
        status: row.status as UploadStatus,
        createdAt: new Date(row.createdAt),
        completedAt: row.completedAt ? new Date(row.completedAt) : undefined,
        fileId: row.fileId
      }));
    } catch (error) {
      throw new DatabaseError('Failed to list stale uploads');
    }
  }

  /**
   * Delete an upload and all associated chunks (cascading).
   */
  async deleteUpload(uploadId: string): Promise<void> {
    try {
      await runQuery(`DELETE FROM uploads WHERE id = ?`, [uploadId]);
    } catch (error) {
      throw new DatabaseError('Failed to delete upload', { uploadId });
    }
  }
}
