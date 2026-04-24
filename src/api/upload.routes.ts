import { Router, Request, Response, NextFunction } from 'express';
import { UploadService } from '../services/upload.service';
import { StorageAdapter } from '../storage/storage.types';
import { HTTP_STATUS_CODE } from '../shared/http-status';
import { getLogger } from '../config/logger';

const logger = getLogger();

/**
 * Create upload REST routes.
 * POST   /api/upload/init                    - Initialize upload
 * PUT    /api/upload/{uploadId}/chunk/{idx}  - Upload chunk
 * GET    /api/upload/{uploadId}/status       - Get upload status
 * POST   /api/upload/{uploadId}/complete     - Complete upload
 * DELETE /api/upload/{uploadId}              - Cancel upload
 * GET    /api/download/{fileId}              - Download file
 */
export function createUploadRoutes(
  uploadService: UploadService,
  storageAdapter: StorageAdapter,
  fileRepo: any
): Router {
  const router = Router();

  /**
   * POST /api/upload/init
   * Initialize a new upload session.
   */
  router.post('/init', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await uploadService.initializeUploadSession(req.body);
      res.status(HTTP_STATUS_CODE.CREATED).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * PUT /api/upload/:uploadId/chunk/:chunkIndex
   * Upload a single chunk (idempotent).
   */
  router.put(
    '/:uploadId/chunk/:chunkIndex',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { uploadId, chunkIndex } = req.params;
        const contentLength = parseInt(req.headers['content-length'] || '0', 10);

        await uploadService.storeChunk(
          uploadId,
          parseInt(chunkIndex, 10),
          req,
          contentLength
        );

        res.status(HTTP_STATUS_CODE.NO_CONTENT).send();
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * GET /api/upload/:uploadId/status
   * Get upload progress (list of uploaded chunk indices).
   */
  router.get('/:uploadId/status', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.params;
      const result = await uploadService.getUploadStatus(uploadId);
      res.status(HTTP_STATUS_CODE.OK).json(result);
    } catch (error) {
      next(error);
    }
  });

  /**
   * POST /api/upload/:uploadId/complete
   * Complete upload and assemble chunks.
   */
  router.post(
    '/:uploadId/complete',
    async (req: Request, res: Response, next: NextFunction) => {
      try {
        const { uploadId } = req.params;
        const result = await uploadService.completeUpload(uploadId);
        res.status(HTTP_STATUS_CODE.OK).json(result);
      } catch (error) {
        next(error);
      }
    }
  );

  /**
   * DELETE /api/upload/:uploadId
   * Cancel upload and clean up.
   */
  router.delete('/:uploadId', async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { uploadId } = req.params;
      await uploadService.cancelUpload(uploadId);
      res.status(HTTP_STATUS_CODE.NO_CONTENT).send();
    } catch (error) {
      next(error);
    }
  });

  /**
   * GET /api/download/:fileId
   * Download completed file (streamed).
   */
  router.get(
    '/download/:fileId',
    async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { fileId } = req.params;

      // Get file metadata
      const fileRecord = await fileRepo.getFileById(fileId);
      if (!fileRecord) {
        res.status(HTTP_STATUS_CODE.NOT_FOUND).json({
          error: 'File not found',
          code: 'NOT_FOUND',
          requestId: (req as any).id
        });
        return;
      }

      // Get readable stream from storage
      const readStream = await storageAdapter.getFinalFileReadStream(fileId);

      // Set response headers
      res.setHeader('Content-Type', 'application/octet-stream');
      res.setHeader('Content-Length', fileRecord.fileSize);
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="${encodeURIComponent(fileRecord.fileName)}"`
      );

      // Pipe stream to response with error handling
      readStream.on('error', (err) => {
        logger.error({ fileId, error: err }, 'Stream error during download');
        if (!res.headersSent) {
          res.status(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).json({
            error: 'Download failed',
            code: 'DOWNLOAD_ERROR',
            requestId: (req as any).id
          });
        }
      });

      readStream.pipe(res);
    } catch (error) {
      next(error);
    }
  }
  );

  return router;
}
