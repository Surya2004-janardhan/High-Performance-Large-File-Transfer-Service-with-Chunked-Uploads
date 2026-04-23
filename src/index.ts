import { createApp } from './app';
import { getConfig } from './config/env';
import { getLogger, buildLogger } from './config/logger';
import { initializeDatabase } from './db/client';
import { initializeDatabaseSchema } from './db/migrate';
import { MinIOAdapter } from './storage/minio.adapter';

const logger = getLogger();

/**
 * Bootstrap and start the server.
 * Load configuration, initialize database/storage, and listen for HTTP requests.
 */
async function startServer(): Promise<void> {
  try {
    // Load configuration
    const config = getConfig();
    logger.info({ config: { port: config.apiPort, env: config.nodeEnv } }, 'Configuration loaded');

    // Initialize logger with configured level
    buildLogger(config.logging.level);

    // Initialize database
    logger.info({ dbPath: config.databasePath }, 'Initializing database');
    await initializeDatabase(config.databasePath);
    
    // Initialize database schema
    logger.info('Creating database schema');
    await initializeDatabaseSchema();

    // Test storage connectivity
    logger.info(
      {
        endpoint: config.storage.endpoint,
        port: config.storage.port,
        bucket: config.storage.bucketName
      },
      'Initializing storage'
    );
    const storageAdapter = new MinIOAdapter(config.storage);
    await storageAdapter.ensureBucketExists(config.storage.bucketName);

    // Create and configure Express app with Phase 2/3 components
    const app = createApp({
      storageConfig: config.storage,
      chunkSize: config.upload.chunkSizeBytes,
      staleMinutes: config.cleanup.staleAfterMinutes,
      cleanupIntervalSeconds: config.cleanup.intervalSeconds
    });

    // Start HTTP server
    const server = app.listen(config.apiPort, () => {
      logger.info(
        { port: config.apiPort, env: config.nodeEnv },
        `Server listening on http://localhost:${config.apiPort}`
      );
      logger.info('Health check endpoint: GET /api/health');
      logger.info('Upload API available: POST /api/upload/init');
    });

    // Graceful shutdown handler
    const gracefulShutdown = async (signal: string) => {
      logger.info({ signal }, 'Shutdown signal received');

      server.close(() => {
        logger.info('HTTP server closed');
        process.exit(0);
      });

      // Force close after 10 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after 10 seconds');
        process.exit(1);
      }, 10000);
    };

    process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
    process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logger.error({ error: message }, 'Failed to start server');
    process.exit(1);
  }
}

// Start the server
startServer();
