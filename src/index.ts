import { createApp } from './app';
import { getConfig } from './config/env';
import { getLogger } from './config/logger';

const logger = getLogger();

/**
 * Bootstrap and start the server.
 * Load configuration, initialize database/storage (Phase 2/3), and listen for HTTP requests.
 */
async function startServer(): Promise<void> {
  try {
    // Load configuration
    const config = getConfig();
    logger.info({ config: { port: config.apiPort, env: config.nodeEnv } }, 'Configuration loaded');

    // Initialize logger with configured level
    const app = createApp();

    // TODO: Phase 2 - Initialize database schema
    // TODO: Phase 3 - Initialize storage adapter and ensure bucket exists

    // Start HTTP server
    const server = app.listen(config.apiPort, () => {
      logger.info(
        { port: config.apiPort, env: config.nodeEnv },
        `Server listening on http://localhost:${config.apiPort}`
      );
      logger.info('Health check endpoint: GET /api/health');
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
