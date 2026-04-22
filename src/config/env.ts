import dotenv from 'dotenv';
import path from 'path';

dotenv.config();

export interface AppConfig {
  nodeEnv: string;
  apiPort: number;
  databasePath: string;
  storage: {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucketName: string;
    useSSL: boolean;
  };
  upload: {
    chunkSizeBytes: number;
  };
  cleanup: {
    staleAfterMinutes: number;
    intervalSeconds: number;
    enabled: boolean;
  };
  logging: {
    level: string;
  };
}

/**
 * Load and validate environment configuration.
 * Throws if required variables are missing or invalid.
 */
export function loadEnvConfig(): AppConfig {
  const requiredVars = [
    'DATABASE_PATH',
    'STORAGE_ENDPOINT',
    'STORAGE_PORT',
    'STORAGE_ACCESS_KEY',
    'STORAGE_SECRET_KEY',
    'STORAGE_BUCKET_NAME'
  ];

  const missing = requiredVars.filter(v => !process.env[v]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  const apiPort = parseInt(process.env.API_PORT || '3000', 10);
  if (isNaN(apiPort) || apiPort < 1 || apiPort > 65535) {
    throw new Error(`Invalid API_PORT: must be a number between 1 and 65535`);
  }

  const storagePort = parseInt(process.env.STORAGE_PORT || '9000', 10);
  if (isNaN(storagePort) || storagePort < 1 || storagePort > 65535) {
    throw new Error(`Invalid STORAGE_PORT: must be a number between 1 and 65535`);
  }

  const chunkSizeBytes = parseInt(process.env.UPLOAD_CHUNK_SIZE_BYTES || '5242880', 10);
  if (isNaN(chunkSizeBytes) || chunkSizeBytes < 1024) {
    throw new Error(`Invalid UPLOAD_CHUNK_SIZE_BYTES: must be >= 1024`);
  }

  const staleAfterMinutes = parseInt(process.env.CLEANUP_STALE_AFTER_MINUTES || '1440', 10);
  if (isNaN(staleAfterMinutes) || staleAfterMinutes < 1) {
    throw new Error(`Invalid CLEANUP_STALE_AFTER_MINUTES: must be >= 1`);
  }

  const cleanupIntervalSeconds = parseInt(process.env.CLEANUP_INTERVAL_SECONDS || '3600', 10);
  if (isNaN(cleanupIntervalSeconds) || cleanupIntervalSeconds < 1) {
    throw new Error(`Invalid CLEANUP_INTERVAL_SECONDS: must be >= 1`);
  }

  const databasePath = process.env.DATABASE_PATH!;
  // Ensure database path is absolute or relative to project root
  const resolvedDbPath = path.isAbsolute(databasePath)
    ? databasePath
    : path.resolve(process.cwd(), databasePath);

  return {
    nodeEnv: process.env.NODE_ENV || 'development',
    apiPort,
    databasePath: resolvedDbPath,
    storage: {
      endpoint: process.env.STORAGE_ENDPOINT!,
      port: storagePort,
      accessKey: process.env.STORAGE_ACCESS_KEY!,
      secretKey: process.env.STORAGE_SECRET_KEY!,
      bucketName: process.env.STORAGE_BUCKET_NAME!,
      useSSL: process.env.STORAGE_USE_SSL === 'true'
    },
    upload: {
      chunkSizeBytes
    },
    cleanup: {
      staleAfterMinutes,
      intervalSeconds: cleanupIntervalSeconds,
      enabled: process.env.CLEANUP_ENABLED !== 'false'
    },
    logging: {
      level: process.env.LOG_LEVEL || 'info'
    }
  };
}

let configInstance: AppConfig | null = null;

/**
 * Get singleton config instance.
 */
export function getConfig(): AppConfig {
  if (!configInstance) {
    configInstance = loadEnvConfig();
  }
  return configInstance;
}
