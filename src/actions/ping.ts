import type { IAction, StandardMessage, IAdapter } from '../core/types.js';

export class PingAction implements IAction {
  name = 'ping';
  description = '检查服务运行状态';

  match(content: string): boolean {
    return content.trim() === '/ping' || content.trim() === '/ping ';
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const uptime = process.uptime();
    const mem = process.memoryUsage();
    const text = [
      '🏓 Pong!',
      `运行时间: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      `内存使用: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    ].join('\n');
    await adapter.sendMessage(msg, text);
  }
}
