import pino from 'pino';

let loggerInstance: pino.Logger | null = null;

/**
 * Build and cache structured logger instance.
 */
export function buildLogger(level: string = 'info'): pino.Logger {
  if (loggerInstance) {
    return loggerInstance;
  }

  // In production or when pino-pretty is not available, output JSON
  // Otherwise, use pino-pretty for development
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  if (isDevelopment) {
    try {
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
    } catch (error) {
      // Fall through to JSON output if pino-pretty fails
    }
  }

  // Default: JSON output (production-safe)
  loggerInstance = pino({ level });
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
