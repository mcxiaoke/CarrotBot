import type { IAction, StandardMessage, IAdapter } from '../core/types.js';

export class DebugAction implements IAction {
  name = 'debug';
  description = '显示消息调试信息';

  match(): boolean {
    return false;
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const raw = msg.raw as Record<string, unknown>;
    const body = raw?.body as Record<string, unknown> || {};

    const lines = [
      `📋 调试信息`,
      `平台: ${msg.platform}`,
      `来源: ${msg.from}`,
      `消息类型: ${msg.msgType}`,
      `内容: ${msg.content}`,
      `---`,
      `chattype: ${body.chattype || 'N/A'}`,
      `chatid: ${body.chatid || 'N/A'}`,
      `userid: ${(body.from as Record<string, unknown>)?.userid || 'N/A'}`,
      `msgid: ${body.msgid || 'N/A'}`,
    ];

    if (msg.mediaUrl) {
      lines.push(`mediaUrl: ${msg.mediaUrl}`);
    }
    if (msg.mediaKey) {
      lines.push(`mediaKey: ${msg.mediaKey}`);
    }
    if (msg.aesKey) {
      lines.push(`aesKey: ${msg.aesKey}`);
    }

    await adapter.sendMessage(msg, lines.join('\n'));
  }
}
