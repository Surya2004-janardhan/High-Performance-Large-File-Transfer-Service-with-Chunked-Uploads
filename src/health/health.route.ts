import { Router, Request, Response } from 'express';
import { HealthService } from './health.service';
import { HTTP_STATUS_CODE } from '../shared/http-status';

/**
 * Create and configure health check routes.
 */
export function createHealthRoutes(): Router {
  const router = Router();
  const healthService = new HealthService();

  /**
   * GET /api/health
   * Return health status of API, database, and storage connectivity.
   */
  router.get('/', async (_req: Request, res: Response) => {
    try {
      const status = await healthService.getHealthStatus();
      res.status(HTTP_STATUS_CODE.OK).json(status);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      res.status(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).json({
        status: 'down',
        database: 'unknown',
        storage: 'unknown',
        timestamp: new Date().toISOString(),
        error: message
      });
    }
  });

  return router;
}
