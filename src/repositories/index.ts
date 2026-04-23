/**
 * Repository exports and creation.
 */

export { UploadRepository } from './uploads.repository';
export { ChunkRepository } from './chunks.repository';
export { FileRepository } from './files.repository';

let uploadRepo: UploadRepository | null = null;
let chunkRepo: ChunkRepository | null = null;
let fileRepo: FileRepository | null = null;

/**
 * Get or create singleton repository instances.
 */
export function initializeRepositories() {
  uploadRepo = new UploadRepository();
  chunkRepo = new ChunkRepository();
  fileRepo = new FileRepository();

  return { uploadRepo, chunkRepo, fileRepo };
}

export function getUploadRepository(): UploadRepository {
  if (!uploadRepo) {
    uploadRepo = new UploadRepository();
  }
  return uploadRepo;
}

export function getChunkRepository(): ChunkRepository {
  if (!chunkRepo) {
    chunkRepo = new ChunkRepository();
  }
  return chunkRepo;
}

export function getFileRepository(): FileRepository {
  if (!fileRepo) {
    fileRepo = new FileRepository();
  }
  return fileRepo;
}
