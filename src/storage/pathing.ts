/**
 * Storage path and naming utilities.
 */

export function getChunkPath(uploadId: string, chunkIndex: number): string {
  return `uploads/${uploadId}/chunks/${chunkIndex}`;
}

export function getFilePath(fileId: string): string {
  return `files/${fileId}`;
}

export function extractUploadIdFromChunkPath(path: string): string | null {
  const match = path.match(/^uploads\/([^\/]+)\/chunks\//);
  return match ? match[1] : null;
}

export function extractChunkIndexFromPath(path: string): number | null {
  const match = path.match(/chunks\/(\d+)$/);
  return match ? parseInt(match[1], 10) : null;
}
