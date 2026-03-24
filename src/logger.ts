/**
 * 日志模块
 * 
 * 本模块提供统一的日志记录功能，支持多级别日志输出和彩色显示。
 * 日志格式：[时间] [级别] 消息
 */

/**
 * 日志级别类型
 */
type LogLevel = 'trace' | 'debug' | 'info' | 'warn' | 'error';

/**
 * 日志级别权重映射
 * 
 * 用于判断是否输出日志，只有权重大于等于当前级别的日志才会输出
 */
const LOG_LEVELS: Record<LogLevel, number> = {
  trace: 10,
  debug: 20,
  info: 30,
  warn: 40,
  error: 50,
};

/**
 * 当前日志级别
 * 
 * 从环境变量 LOG_LEVEL 读取，默认为 'info'
 */
const currentLevel = LOG_LEVELS[(process.env.LOG_LEVEL as LogLevel) || 'info'];

/**
 * 格式化时间戳
 * 
 * @returns 格式化的时间字符串，格式：YYYY-MM-DD HH:mm:ss
 */
function formatTime(): string {
  return new Date().toISOString().replace('T', ' ').substring(0, 19);
}

/**
 * 格式化日志消息
 * 
 * @param level - 日志级别
 * @param msg - 消息内容
 * @param data - 附加数据（可选）
 * @returns 格式化的日志字符串
 */
function formatMessage(level: LogLevel, msg: string, data?: Record<string, unknown>): string {
  const time = formatTime();
  const levelStr = level.toUpperCase().padEnd(5);
  let output = `[${time}] [${levelStr}] ${msg}`;
  // 如果有附加数据，以 JSON 格式追加
  if (data && Object.keys(data).length > 0) {
    output += '\n' + JSON.stringify(data, null, 2);
  }
  return output;
}

/**
 * 日志颜色映射
 * 
 * 使用 ANSI 转义码实现终端彩色输出
 */
const colors = {
  trace: '\x1b[90m',   // 灰色
  debug: '\x1b[36m',   // 青色
  info: '\x1b[32m',    // 绿色
  warn: '\x1b[33m',    // 黄色
  error: '\x1b[31m',   // 红色
  reset: '\x1b[0m',    // 重置
};

/**
 * 核心日志函数
 * 
 * 根据日志级别判断是否输出，并格式化输出日志消息。
 * 
 * @param level - 日志级别
 * @param data - 消息内容或附加数据对象
 * @param msg - 消息内容（当 data 为对象时使用）
 */
function log(level: LogLevel, data: Record<string, unknown> | string, msg?: string): void {
  // 检查日志级别是否满足输出条件
  if (LOG_LEVELS[level] < currentLevel) return;

  let actualData: Record<string, unknown> | undefined;
  let actualMsg: string;

  // 处理不同的参数形式
  if (typeof data === 'string') {
    actualMsg = data;
    actualData = msg ? { msg } : undefined;
  } else {
    actualData = data;
    actualMsg = msg || '';
  }

  // 格式化并着色
  const message = formatMessage(level, actualMsg, actualData);
  const color = colors[level];
  const output = `${color}${message}${colors.reset}`;

  // 根据级别选择输出流
  if (level === 'error') {
    console.error(output);
  } else if (level === 'warn') {
    console.warn(output);
  } else {
    console.log(output);
  }
}

/**
 * 日志对象
 * 
 * 提供各级别的日志方法，以及创建子日志器的能力。
 */
export const logger = {
  /**
   * 输出 trace 级别日志
   * @param data - 消息内容或数据对象
   * @param msg - 消息内容（可选）
   */
  trace: (data: Record<string, unknown> | string, msg?: string) => log('trace', data, msg),
  
  /**
   * 输出 debug 级别日志
   * @param data - 消息内容或数据对象
   * @param msg - 消息内容（可选）
   */
  debug: (data: Record<string, unknown> | string, msg?: string) => log('debug', data, msg),
  
  /**
   * 输出 info 级别日志
   * @param data - 消息内容或数据对象
   * @param msg - 消息内容（可选）
   */
  info: (data: Record<string, unknown> | string, msg?: string) => log('info', data, msg),
  
  /**
   * 输出 warn 级别日志
   * @param data - 消息内容或数据对象
   * @param msg - 消息内容（可选）
   */
  warn: (data: Record<string, unknown> | string, msg?: string) => log('warn', data, msg),
  
  /**
   * 输出 error 级别日志
   * 
   * 特殊处理 Error 对象，提取错误消息和堆栈信息。
   * 
   * @param data - 错误对象、消息内容或数据对象
   * @param msg - 消息内容（可选）
   */
  error: (data: Record<string, unknown> | Error | string, msg?: string) => {
    if (data instanceof Error) {
      log('error', { error: data.message, stack: data.stack }, msg);
    } else if (typeof data === 'string') {
      log('error', {}, data);
    } else {
      log('error', data, msg);
    }
  },
  
  /**
   * 创建子日志器
   * 
   * 子日志器会自动附加预设的绑定数据到每条日志。
   * 
   * @param bindings - 预设的绑定数据
   * @returns 子日志器对象
   */
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
