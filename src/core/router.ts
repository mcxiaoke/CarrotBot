/**
 * 消息路由分发器模块
 * 
 * 本模块实现了消息路由器，负责将收到的消息分发给匹配的命令处理器。
 * 路由器维护一个命令处理器列表，按注册顺序依次匹配，第一个匹配成功的处理器将执行该消息。
 */

import type { IAction, IAdapter, StandardMessage } from './types.js';
import { logger } from '../logger.js';

/**
 * 消息路由器类
 * 
 * 负责管理命令处理器并将消息分发给正确的处理器。
 * 
 * 工作流程：
 * 1. 收到消息后，依次遍历已注册的命令处理器
 * 2. 调用每个处理器的 match() 方法判断是否匹配
 * 3. 第一个匹配成功的处理器执行 execute() 方法
 * 4. 如果没有匹配的处理器，执行默认处理器（如果设置了）
 * 
 * @example
 * ```typescript
 * const router = new MessageRouter();
 * router.register(new PingAction());
 * router.register(new HelpAction(router));
 * router.setDefault(new DebugAction());
 * 
 * // 分发消息
 * router.dispatch(message, adapter);
 * ```
 */
export class MessageRouter {
  /** 已注册的命令处理器列表 */
  private actions: IAction[] = [];
  
  /** 默认命令处理器，当没有处理器匹配时执行 */
  private defaultAction: IAction | null = null;

  /**
   * 注册命令处理器
   * 
   * 将新的命令处理器添加到处理器列表末尾。
   * 处理器按注册顺序进行匹配，先注册的处理器优先匹配。
   * 
   * @param action - 要注册的命令处理器
   * @returns 返回 this 以支持链式调用
   */
  register(action: IAction): this {
    this.actions.push(action);
    logger.info(`Registered action: ${action.name}`);
    return this;
  }

  /**
   * 设置默认命令处理器
   * 
   * 当消息不匹配任何已注册的处理器时，将执行此默认处理器。
   * 
   * @param action - 默认命令处理器
   * @returns 返回 this 以支持链式调用
   */
  setDefault(action: IAction): this {
    this.defaultAction = action;
    return this;
  }

  /**
   * 分发消息到匹配的命令处理器
   * 
   * 遍历所有已注册的处理器，找到第一个匹配的处理器并执行。
   * 如果没有匹配的处理器，执行默认处理器（如果设置了）。
   * 
   * @param msg - 标准消息对象
   * @param adapter - 平台适配器，用于发送回复
   */
  async dispatch(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    logger.debug({ msg }, 'Dispatching message');

    // 遍历所有已注册的处理器，查找匹配的处理器
    for (const action of this.actions) {
      if (action.match(msg.content)) {
        logger.info(`Matched action: ${action.name}`);
        try {
          // 执行匹配的处理器
          await action.execute(msg, adapter);
        } catch (err) {
          // 处理执行过程中的错误
          logger.error({ err, action: action.name }, 'Action execution failed');
          try {
            // 尝试向用户发送错误信息
            await adapter.sendMessage(msg, `执行命令时出错: ${err}`);
          } catch (sendErr) {
            logger.error({ sendErr }, 'Failed to send error message');
          }
        }
        return;
      }
    }

    // 没有匹配的处理器，执行默认处理器
    if (this.defaultAction) {
      try {
        await this.defaultAction.execute(msg, adapter);
      } catch (err) {
        logger.error({ err, action: 'default' }, 'Default action execution failed');
      }
    } else {
      logger.warn({ msg }, 'No action matched and no default action set');
    }
  }

  /**
   * 获取帮助文本
   * 
   * 生成包含所有已注册命令的帮助信息。
   * 
   * @returns 格式化的帮助文本
   */
  getHelpText(): string {
    const lines = ['可用命令:'];
    for (const action of this.actions) {
      lines.push(`  /${action.name} - ${action.description}`);
    }
    return lines.join('\n');
  }
}
