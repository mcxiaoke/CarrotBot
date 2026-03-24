import type { IAction, StandardMessage, IAdapter } from '../core/types.js';

function escapeMarkdown(text: string): string {
  return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&');
}

export class DebugAction implements IAction {
  name = 'debug';
  description = '显示消息调试信息';

  match(): boolean {
    return false;
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const raw = msg.raw as Record<string, unknown>;

    const lines = [
      `📋 调试信息`,
      `平台: ${msg.platform}`,
      `来源: ${msg.from}`,
      `消息类型: ${msg.msgType}`,
      `内容: ${msg.content}`,
    ];

    if (msg.platform === 'wecom') {
      const body = raw?.body as Record<string, unknown> || {};
      lines.push(`---`);
      lines.push(`chattype: ${body.chattype || 'N/A'}`);
      lines.push(`chatid: ${body.chatid || 'N/A'}`);
      lines.push(`userid: ${(body.from as Record<string, unknown>)?.userid || 'N/A'}`);
      lines.push(`msgid: ${body.msgid || 'N/A'}`);
      
      if (msg.mediaUrl) lines.push(`mediaUrl: ${msg.mediaUrl}`);
      if (msg.mediaKey) lines.push(`mediaKey: ${msg.mediaKey}`);
      if (msg.aesKey) lines.push(`aesKey: ${msg.aesKey}`);
    } else if (msg.platform === 'telegram') {
      const tgMsg = raw as any;
      lines.push(`---`);
      lines.push(`chat_id: ${tgMsg?.chat?.id || 'N/A'}`);
      lines.push(`chat_type: ${tgMsg?.chat?.type || 'N/A'}`);
      lines.push(`user_id: ${tgMsg?.from?.id || 'N/A'}`);
      lines.push(`username: ${tgMsg?.from?.username || 'N/A'}`);
      lines.push(`message_id: ${tgMsg?.message_id || 'N/A'}`);
      lines.push(`date: ${tgMsg?.date ? new Date(tgMsg.date * 1000).toISOString() : 'N/A'}`);
      
      if (msg.mediaUrl) lines.push(`file_id: ${msg.mediaUrl}`);
    }

    const content = lines.join('\n');
    
    if (msg.platform === 'telegram') {
      const escaped = escapeMarkdown(content);
      await adapter.sendMessage(msg, escaped);
    } else {
      await adapter.sendMessage(msg, content);
    }
  }
}
