import AiBot, { WSClient } from '@wecom/aibot-node-sdk';
import type { WsFrame } from '@wecom/aibot-node-sdk';
import type { IAdapter, StandardMessage } from '../core/types.js';
import { logger } from '../logger.js';

export interface WeComConfig {
  botId: string;
  botSecret: string;
}

export class WeComAdapter implements IAdapter {
  readonly platform = 'wecom';
  private client: WSClient;
  private onMessage: ((msg: StandardMessage) => void) | null = null;

  constructor(config: WeComConfig) {
    this.client = new AiBot.WSClient({
      botId: config.botId,
      secret: config.botSecret,
    });
  }

  parseMessage(raw: unknown): StandardMessage {
    const frame = raw as WsFrame;
    const content = frame.body.text?.content || '';
    const chatid = frame.body.chatid;
    const userid = frame.body.from?.userid;
    const from = chatid || userid || '';

    return {
      platform: this.platform,
      from,
      content: content.trim(),
      raw,
    };
  }

  async sendMessage(msg: StandardMessage, content: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.reply(frame, {
        msgtype: 'markdown',
        markdown: { content },
      });
      logger.debug({ to: msg.from, content }, 'Message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send message');
      throw err;
    }
  }

  setMessageHandler(handler: (msg: StandardMessage) => void): void {
    this.onMessage = handler;
  }

  connect(): void {
    this.client.connect();

    this.client.on('authenticated', () => {
      logger.info('WeCom WebSocket authenticated');
    });

    this.client.on('message.text', (frame: WsFrame) => {
      logger.debug({ frame }, 'Received text message');
      if (this.onMessage) {
        const msg = this.parseMessage(frame);
        this.onMessage(msg);
      }
    });

    this.client.on('event.enter_chat', async (frame: WsFrame) => {
      logger.info({ frame }, 'User entered chat');
      await this.client.replyWelcome(frame, {
        msgtype: 'text',
        text: { content: '你好！我是 CarrotBot，发送 /help 查看可用命令。' },
      });
    });

    this.client.on('disconnected', () => {
      logger.warn('WeCom WebSocket disconnected');
    });

    this.client.on('error', (err: Error) => {
      logger.error({ err }, 'WeCom WebSocket error');
    });
  }

  disconnect(): void {
    this.client.disconnect();
    logger.info('WeCom WebSocket disconnected');
  }
}
