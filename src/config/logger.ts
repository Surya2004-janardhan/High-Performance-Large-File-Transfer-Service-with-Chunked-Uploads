import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

/**
 * Build and cache structured logger instance.
 */
export function buildLogger(level: string = 'info'): pino.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  loggerInstance = pino({
    level,
    transport: {
      target: 'pino-pretty',
      options: {
        colorize: true,
        translateTime: 'SYS:standard',
        singleLine: false
      }
    }
  });

  return loggerInstance;
}

/**
 * Get cached logger instance or create new one.
 */
export function getLogger(): pino.Logger {
  if (!loggerInstance) {
    return buildLogger();
  }
  return loggerInstance;
}
