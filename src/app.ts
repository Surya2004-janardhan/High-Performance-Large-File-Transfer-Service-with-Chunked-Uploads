import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { createHealthRoutes } from './health/health.route';
import { getLogger } from './config/logger';
import { HEADER_REQUEST_ID } from './config/constants';

/**
 * Create and configure Express application.
 * Wire up middleware, routes, and error handling.
 */
export function createApp(): Express {
  const app = express();
  const logger = getLogger();

  // CORS middleware
  app.use(cors({
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  }));

  // Body parser middleware
  app.use(bodyParser.json({ limit: '10mb' }));
  app.use(bodyParser.urlencoded({ limit: '10mb', extended: true }));

  // Structured logging middleware
  app.use(pinoHttp({ logger }));

  // Request ID middleware: attach unique request ID to each request
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = req.headers[HEADER_REQUEST_ID] || uuidv4();
    req.id = requestId as string;
    res.setHeader(HEADER_REQUEST_ID, req.id);
    next();
  });

  // Health check routes
  app.use('/api/health', createHealthRoutes());

  // Placeholder route for future API endpoints
  app.get('/api', (_req: Request, res: Response) => {
    res.json({
      message: 'Large File Transfer Service API',
      version: '1.0.0',
      status: 'running'
    });
  });

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      path: req.path,
      method: req.method
    });
  });

  // Global error handler
  app.use((err: any, req: Request, res: Response, _next: NextFunction) => {
    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    logger.error({
      requestId: req.id,
      error: err,
      statusCode,
      path: req.path,
      method: req.method
    });

    res.status(statusCode).json({
      error: message,
      code: err.code || 'INTERNAL_SERVER_ERROR',
      requestId: req.id,
      timestamp: new Date().toISOString()
    });
  });

  return app;
}

// Extend Express Request to include requestId
declare global {
  namespace Express {
    interface Request {
      id: string;
    }
  }
}
