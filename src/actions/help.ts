import type { IAction, StandardMessage, IAdapter } from '../core/types.js';
import type { MessageRouter } from '../core/router.js';

export class HelpAction implements IAction {
  name = 'help';
  description = '显示帮助信息';
  private router: MessageRouter;

  constructor(router: MessageRouter) {
    this.router = router;
  }

  match(content: string): boolean {
    return content.trim() === '/help' || content.trim() === '/help ';
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const helpText = this.router.getHelpText();
    await adapter.sendMessage(msg, helpText);
  }
}
