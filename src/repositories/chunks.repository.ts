import { getAll, getOne, runQuery } from '../db/client';
import { ChunkRecord } from '../domain/upload/upload.types';
import { DatabaseError } from '../shared/errors';

/**
 * Repository for managing chunk records.
 */
export class ChunkRepository {
  /**
   * Upsert a chunk record (insert or replace if exists).
   * Idempotent: re-uploading same chunk doesn't error.
   */
  async upsertChunkRecord(
    uploadId: string,
    chunkIndex: number,
    size: number,
    etag?: string
  ): Promise<void> {
    try {
      await runQuery(
        `INSERT OR REPLACE INTO chunks (upload_id, chunk_index, size, etag)
         VALUES (?, ?, ?, ?)`,
        [uploadId, chunkIndex, size, etag || null]
      );
    } catch (error) {
      throw new DatabaseError('Failed to upsert chunk record', { uploadId, chunkIndex });
    }
  }

  /**
   * Check if a chunk exists for an upload.
   */
  async chunkExists(uploadId: string, chunkIndex: number): Promise<boolean> {
    try {
      const row = await getOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM chunks WHERE upload_id = ? AND chunk_index = ?`,
        [uploadId, chunkIndex]
      );
      return (row?.count ?? 0) > 0;
    } catch (error) {
      throw new DatabaseError('Failed to check chunk existence', { uploadId, chunkIndex });
    }
  }

  /**
   * Get all uploaded chunk indices for an upload (sorted).
   */
  async listUploadedChunkIndices(uploadId: string): Promise<number[]> {
    try {
      const rows = await getAll<{ chunkIndex: number }>(
        `SELECT chunk_index as chunkIndex FROM chunks WHERE upload_id = ? ORDER BY chunk_index ASC`,
        [uploadId]
      );
      return rows.map(row => row.chunkIndex);
    } catch (error) {
      throw new DatabaseError('Failed to list uploaded chunks', { uploadId });
    }
  }

  /**
   * Count total uploaded chunks for an upload.
   */
  async countChunks(uploadId: string): Promise<number> {
    try {
      const row = await getOne<{ count: number }>(
        `SELECT COUNT(*) as count FROM chunks WHERE upload_id = ?`,
        [uploadId]
      );
      return row?.count ?? 0;
    } catch (error) {
      throw new DatabaseError('Failed to count chunks', { uploadId });
    }
  }

  /**
   * Delete all chunks for an upload.
   * Typically called during cancellation.
   */
  async deleteChunksByUploadId(uploadId: string): Promise<void> {
    try {
      await runQuery(`DELETE FROM chunks WHERE upload_id = ?`, [uploadId]);
    } catch (error) {
      throw new DatabaseError('Failed to delete chunks', { uploadId });
    }
  }

  /**
   * Get a specific chunk record.
   */
  async getChunk(uploadId: string, chunkIndex: number): Promise<ChunkRecord | undefined> {
    try {
      const row = await getOne<ChunkRecord>(
        `SELECT upload_id as uploadId, chunk_index as chunkIndex, size, etag
         FROM chunks WHERE upload_id = ? AND chunk_index = ?`,
        [uploadId, chunkIndex]
      );
      return row;
    } catch (error) {
      throw new DatabaseError('Failed to get chunk', { uploadId, chunkIndex });
    }
  }
}
