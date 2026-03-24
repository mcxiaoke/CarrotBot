/**
 * Help 命令处理器模块
 * 
 * 实现 /help 命令，用于显示所有可用命令的帮助信息。
 */

import type { IAction, StandardMessage, IAdapter } from '../core/types.js';
import type { MessageRouter } from '../core/router.js';

/**
 * Help 命令处理器类
 * 
 * 当用户发送 /help 命令时，返回所有已注册命令的帮助信息。
 * 需要传入 MessageRouter 实例以获取命令列表。
 * 
 * @example
 * 用户输入: /help
 * 机器人回复:
 *   可用命令:
 *     /ping - 检查服务运行状态
 *     /help - 显示帮助信息
 *     /lan - 显示局域网在线设备列表
 */
export class HelpAction implements IAction {
  /** 命令名称 */
  name = 'help';
  
  /** 命令描述 */
  description = '显示帮助信息';
  
  /** 消息路由器实例，用于获取命令列表 */
  private router: MessageRouter;

  /**
   * 创建 Help 命令处理器实例
   * @param router - 消息路由器实例
   */
  constructor(router: MessageRouter) {
    this.router = router;
  }

  /**
   * 判断消息是否匹配 /help 命令
   * @param content - 消息文本内容
   * @returns 是否匹配
   */
  match(content: string): boolean {
    return content.trim() === '/help' || content.trim() === '/help ';
  }

  /**
   * 执行 help 命令
   * 
   * 从路由器获取所有已注册命令的帮助文本并返回。
   * 
   * @param msg - 标准消息对象
   * @param adapter - 平台适配器
   */
  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const helpText = this.router.getHelpText();
    await adapter.sendMessage(msg, helpText);
  }
}
