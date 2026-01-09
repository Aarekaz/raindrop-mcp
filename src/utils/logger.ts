/**
 * Simple logging utility that writes to stderr to avoid polluting stdio
 * Used for debugging and error reporting
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LoggerOptions {
  prefix?: string;
  level?: LogLevel;
}

const LOG_LEVELS: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export class Logger {
  private prefix: string;
  private minLevel: number;

  constructor(options: LoggerOptions = {}) {
    this.prefix = options.prefix || 'raindrop-mcp';
    const level = options.level || (process.env.NODE_ENV === 'development' ? 'debug' : 'info');
    this.minLevel = LOG_LEVELS[level];
  }

  private log(level: LogLevel, ...args: unknown[]): void {
    if (LOG_LEVELS[level] >= this.minLevel) {
      const timestamp = new Date().toISOString();
      const prefix = `[${timestamp}] [${level.toUpperCase()}] [${this.prefix}]`;
      // Always write to stderr to avoid interfering with stdio-based MCP communication
      console.error(prefix, ...args);
    }
  }

  debug(...args: unknown[]): void {
    this.log('debug', ...args);
  }

  info(...args: unknown[]): void {
    this.log('info', ...args);
  }

  warn(...args: unknown[]): void {
    this.log('warn', ...args);
  }

  error(...args: unknown[]): void {
    this.log('error', ...args);
  }
}

/**
 * Create a new logger instance with optional prefix
 */
export function createLogger(prefix?: string): Logger {
  return new Logger({ prefix });
}
