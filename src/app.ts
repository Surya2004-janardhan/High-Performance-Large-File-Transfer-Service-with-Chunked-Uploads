import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import bodyParser from 'body-parser';
import pinoHttp from 'pino-http';
import { v4 as uuidv4 } from 'uuid';
import { createHealthRoutes } from './health/health.route';
import { createUploadRoutes } from './api/upload.routes';
import { createTestingRoutes } from './api/testing.routes';
import { errorMiddleware } from './api/error.middleware';
import { UploadService } from './services/upload.service';
import { MinIOAdapter } from './storage/minio.adapter';
import { StorageConfig } from './storage/storage.types';
import { getFileRepository, initializeRepositories } from './repositories/index';
import { CleanupWorker } from './workers/cleanup.worker';
import { getLogger } from './config/logger';
import { HEADER_REQUEST_ID } from './config/constants';

/**
 * Create and configure Express application.
 * Wire up middleware, routes, and error handling.
 */
export function createApp(options?: {
  storageConfig?: StorageConfig;
  chunkSize?: number;
  staleMinutes?: number;
  cleanupIntervalSeconds?: number;
}): Express {
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

  // Initialize repositories
  initializeRepositories();

  // Initialize storage adapter if provided
  let cleanupWorker: CleanupWorker | null = null;

  if (options?.storageConfig) {
    const storageAdapter = new MinIOAdapter(options.storageConfig);
    const chunkSize = options.chunkSize || 5242880; // 5MB default
    const uploadService = new UploadService(storageAdapter, chunkSize);

    const staleMinutes = options.staleMinutes || 1440; // 1 day default
    const cleanupInterval = options.cleanupIntervalSeconds || 3600; // 1 hour default
    cleanupWorker = new CleanupWorker(staleMinutes, cleanupInterval);

    // Create routes
    const fileRepo = getFileRepository();
    app.use('/api/upload', createUploadRoutes(uploadService, storageAdapter, fileRepo));
    app.use('/api/testing', createTestingRoutes(cleanupWorker));

    logger.info('Upload and testing routes registered');
  } else {
    logger.warn('Storage config not provided; upload routes will not be available');
  }

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
  app.use((_req: Request, res: Response) => {
    res.status(404).json({
      error: 'Not Found',
      path: _req.path,
      method: _req.method
    });
  });

  // Global error handler (must be last)
  app.use(errorMiddleware);

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
