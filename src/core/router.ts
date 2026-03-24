import type { IAction, IAdapter, StandardMessage } from './types.js';
import { logger } from '../logger.js';

export class MessageRouter {
  private actions: IAction[] = [];
  private defaultAction: IAction | null = null;

  register(action: IAction): this {
    this.actions.push(action);
    logger.info(`Registered action: ${action.name}`);
    return this;
  }

  setDefault(action: IAction): this {
    this.defaultAction = action;
    return this;
  }

  async dispatch(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    logger.debug({ msg }, 'Dispatching message');

    for (const action of this.actions) {
      if (action.match(msg.content)) {
        logger.info(`Matched action: ${action.name}`);
        try {
          await action.execute(msg, adapter);
        } catch (err) {
          logger.error({ err, action: action.name }, 'Action execution failed');
          try {
            await adapter.sendMessage(msg, `执行命令时出错: ${err}`);
          } catch (sendErr) {
            logger.error({ sendErr }, 'Failed to send error message');
          }
        }
        return;
      }
    }

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

  getHelpText(): string {
    const lines = ['可用命令:'];
    for (const action of this.actions) {
      lines.push(`  /${action.name} - ${action.description}`);
    }
    return lines.join('\n');
  }
}
