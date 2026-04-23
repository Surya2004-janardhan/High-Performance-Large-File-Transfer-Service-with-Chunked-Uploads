import { Request, Response, NextFunction } from 'express';
import { ApplicationError } from '../shared/errors';
import { getLogger } from '../config/logger';
import { HTTP_STATUS_CODE } from '../shared/http-status';

const logger = getLogger();

/**
 * Global error middleware for consistent error responses.
 * Transforms domain errors into HTTP responses.
 */
export function errorMiddleware(
  err: any,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const requestId = (_req as any).id || 'unknown';

  if (err instanceof ApplicationError) {
    logger.warn({
      requestId,
      code: err.code,
      statusCode: err.statusCode,
      message: err.message,
      details: err.details
    });

    res.status(err.statusCode).json({
      error: err.message,
      code: err.code,
      details: err.details,
      requestId,
      timestamp: new Date().toISOString()
    });
    return;
  }

  // Unexpected error
  logger.error({
    requestId,
    error: err,
    message: err instanceof Error ? err.message : String(err),
    stack: err instanceof Error ? err.stack : undefined
  });

  res.status(HTTP_STATUS_CODE.INTERNAL_SERVER_ERROR).json({
    error: 'Internal Server Error',
    code: 'INTERNAL_SERVER_ERROR',
    requestId,
    timestamp: new Date().toISOString()
  });
}
