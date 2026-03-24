type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

function formatMessage(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const time = formatTime();
  const levelStr = level.toUpperCase().padEnd(5);
  let output = `[${time}] [${levelStr}] ${msg}`;
  if (data && Object.keys(data).length > 0) {
    output += '\n' + JSON.stringify(data, null, 2);
  }
  return output;
}

const colors = {
  trace: '\x1b[90m',
  debug: '\x1b[36m',
  info: '\x1b[32m',
  warn: '\x1b[33m',
  error: '\x1b[31m',
  reset: '\x1b[0m',
};

function log(level: LogLevel, data: Record<string, unknown> | string, msg?: string): void {
  if (LOG_LEVELS[level] < currentLevel) return;

  let actualData: Record<string, unknown> | undefined;
  let actualMsg: string;

  if (typeof data === 'string') {
    actualMsg = data;
    actualData = msg ? { msg } : undefined;
  } else {
    actualData = data;
    actualMsg = msg || '';
  }

  const message = formatMessage(level, actualMsg, actualData);
  const color = colors[level];
  const output = `${color}${message}${colors.reset}`;

  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

export const logger = {
  trace: (data: Record<string, unknown> | string, msg?: string) => log('trace', data, msg),
  debug: (data: Record<string, unknown> | string, msg?: string) => log('debug', data, msg),
  info: (data: Record<string, unknown> | string, msg?: string) => log('info', data, msg),
  warn: (data: Record<string, unknown> | string, msg?: string) => log('warn', data, msg),
  error: (data: Record<string, unknown> | Error | string, msg?: string) => {
    if (data instanceof Error) {
      log('error', { error: data.message, stack: data.stack }, msg);
    } else if (typeof data === 'string') {
      log('error', {}, data);
    } else {
      log('error', data, msg);
    }
  },
  child: (bindings: Record<string, unknown>) => {
    return {
      trace: (data: Record<string, unknown> | string, msg?: string) => {
        const merged = typeof data === 'string' ? { ...bindings } : { ...bindings, ...data };
        log('trace', merged, typeof data === 'string' ? data : msg);
      },
      debug: (data: Record<string, unknown> | string, msg?: string) => {
        const merged = typeof data === 'string' ? { ...bindings } : { ...bindings, ...data };
        log('debug', merged, typeof data === 'string' ? data : msg);
      },
      info: (data: Record<string, unknown> | string, msg?: string) => {
        const merged = typeof data === 'string' ? { ...bindings } : { ...bindings, ...data };
        log('info', merged, typeof data === 'string' ? data : msg);
      },
      warn: (data: Record<string, unknown> | string, msg?: string) => {
        const merged = typeof data === 'string' ? { ...bindings } : { ...bindings, ...data };
        log('warn', merged, typeof data === 'string' ? data : msg);
      },
      error: (data: Record<string, unknown> | Error | string, msg?: string) => {
        if (data instanceof Error) {
          log('error', { ...bindings, error: data.message, stack: data.stack }, msg);
        } else if (typeof data === 'string') {
          log('error', bindings, data);
        } else {
          log('error', { ...bindings, ...data }, msg);
        }
      },
    };
  },
};
