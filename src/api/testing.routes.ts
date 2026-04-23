import { Router, Request, Response, NextFunction } from 'express';
import { HTTP_STATUS_CODE } from '../shared/http-status';

/**
 * Create testing routes for manual cleanup trigger.
 * POST /api/testing/run-cleanup - Trigger cleanup worker manually
 */
export function createTestingRoutes(cleanupWorker: any): Router {
  const router = Router();

  /**
   * POST /api/testing/run-cleanup
   * Manually trigger the cleanup worker (for testing).
   */
  router.post('/run-cleanup', async (_req: Request, res: Response, next: NextFunction) => {
    try {
      const result = await cleanupWorker.runCleanupNow();
      res.status(HTTP_STATUS_CODE.OK).json({
        message: 'Cleanup executed',
        expired: result.expiredUploads,
        deletedChunks: result.deletedChunks,
        timestamp: new Date().toISOString()
      });
    } catch (error) {
      next(error);
    }
  });

  return router;
}
