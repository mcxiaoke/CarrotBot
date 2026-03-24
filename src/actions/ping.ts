/**
 * Ping 命令处理器模块
 * 
 * 实现 /ping 命令，用于检查服务运行状态。
 * 返回服务运行时间和内存使用情况。
 */

import type { IAction, StandardMessage, IAdapter } from '../core/types.js';

/**
 * Ping 命令处理器类
 * 
 * 当用户发送 /ping 命令时，返回服务的运行状态信息。
 * 
 * @example
 * 用户输入: /ping
 * 机器人回复:
 *   🏓 Pong!
 *   运行时间: 1h 23m
 *   内存使用: 45MB
 */
export class PingAction implements IAction {
  /** 命令名称 */
  name = 'ping';
  
  /** 命令描述 */
  description = '检查服务运行状态';

  /**
   * 判断消息是否匹配 /ping 命令
   * @param content - 消息文本内容
   * @returns 是否匹配
   */
  match(content: string): boolean {
    return content.trim() === '/ping' || content.trim() === '/ping ';
  }

  /**
   * 执行 ping 命令
   * 
   * 计算并返回服务运行时间和内存使用情况。
   * 
   * @param msg - 标准消息对象
   * @param adapter - 平台适配器
   */
  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    // 获取进程运行时间（秒）
    const uptime = process.uptime();
    // 获取内存使用情况
    const mem = process.memoryUsage();
    
    // 构建回复消息
    const text = [
      '🏓 Pong!',
      `运行时间: ${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`,
      `内存使用: ${Math.round(mem.heapUsed / 1024 / 1024)}MB`,
    ].join('\n');
    
    await adapter.sendMessage(msg, text);
  }
}
