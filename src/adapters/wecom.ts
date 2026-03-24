import AiBot, { WSClient } from '@wecom/aibot-node-sdk';
import type { WsFrame, TemplateCard } from '@wecom/aibot-node-sdk';
import { generateReqId } from '@wecom/aibot-node-sdk';
import type { IAdapter, StandardMessage, MessageType } from '../core/types.js';
import { saveIncomingMessage, saveOutgoingMessage } from '../storage/message-store.js';
import { logger } from '../logger.js';

export interface WeComConfig {
  botId: string;
  botSecret: string;
}

export type WeComEventType = 'enter_chat' | 'template_card_event' | 'feedback_event' | 'disconnected_event';

export interface WeComEvent {
  type: WeComEventType;
  frame: WsFrame;
}

export class WeComAdapter implements IAdapter {
  readonly platform = 'wecom';
  private client: WSClient;
  private onMessage: ((msg: StandardMessage) => void) | null = null;
  private onEvent: ((event: WeComEvent) => void) | null = null;

  constructor(config: WeComConfig) {
    this.client = new AiBot.WSClient({
      botId: config.botId,
      secret: config.botSecret,
    });
  }

  parseMessage(raw: unknown): StandardMessage {
    const frame = raw as WsFrame;
    const body = frame.body as Record<string, unknown>;
    const msgtype = body.msgtype as string;

    let content = '';
    let msgType: MessageType = 'text';
    let mediaUrl: string | undefined;
    let mediaKey: string | undefined;
    let aesKey: string | undefined;

    switch (msgtype) {
      case 'text':
        content = (body.text as Record<string, string>)?.content || '';
        msgType = 'text';
        break;
      case 'image':
        content = '[图片]';
        msgType = 'image';
        mediaUrl = (body.image as Record<string, string>)?.url;
        mediaKey = (body.image as Record<string, string>)?.key;
        aesKey = (body.image as Record<string, string>)?.aeskey;
        break;
      case 'voice':
        content = '[语音]';
        msgType = 'voice';
        mediaUrl = (body.voice as Record<string, string>)?.url;
        mediaKey = (body.voice as Record<string, string>)?.key;
        aesKey = (body.voice as Record<string, string>)?.aeskey;
        break;
      case 'video':
        content = '[视频]';
        msgType = 'video';
        mediaUrl = (body.video as Record<string, string>)?.url;
        mediaKey = (body.video as Record<string, string>)?.key;
        aesKey = (body.video as Record<string, string>)?.aeskey;
        break;
      case 'file':
        content = `[文件] ${(body.file as Record<string, string>)?.filename || ''}`;
        msgType = 'file';
        mediaUrl = (body.file as Record<string, string>)?.url;
        mediaKey = (body.file as Record<string, string>)?.key;
        aesKey = (body.file as Record<string, string>)?.aeskey;
        break;
      case 'mixed':
        content = '[图文混排]';
        msgType = 'mixed';
        break;
      case 'event':
        content = '[事件]';
        msgType = 'event';
        break;
      default:
        content = `[未知消息类型: ${msgtype}]`;
        msgType = 'text';
    }

    const chatid = body.chatid as string;
    const userid = (body.from as Record<string, string>)?.userid;
    const from = chatid || userid || '';

    return {
      platform: this.platform,
      from,
      content: content.trim(),
      msgType,
      raw,
      mediaUrl,
      mediaKey,
      aesKey,
    };
  }

  async sendMessage(msg: StandardMessage, content: string): Promise<void> {
    return this.sendMarkdown(msg, content);
  }

  async sendText(msg: StandardMessage, content: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.reply(frame, {
        msgtype: 'text',
        text: { content },
      });
      await saveOutgoingMessage(msg, 'text', content);
      logger.debug({ to: msg.from, content }, 'Text message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send text message');
      throw err;
    }
  }

  async sendMarkdown(msg: StandardMessage, content: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.reply(frame, {
        msgtype: 'markdown',
        markdown: { content },
      });
      await saveOutgoingMessage(msg, 'markdown', content);
      logger.debug({ to: msg.from, content }, 'Markdown message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send markdown message');
      throw err;
    }
  }

  async sendImage(msg: StandardMessage, mediaId: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyMedia(frame, 'image', mediaId);
      await saveOutgoingMessage(msg, 'image', null, mediaId);
      logger.debug({ to: msg.from, mediaId }, 'Image message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send image message');
      throw err;
    }
  }

  async sendVoice(msg: StandardMessage, mediaId: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyMedia(frame, 'voice', mediaId);
      await saveOutgoingMessage(msg, 'voice', null, mediaId);
      logger.debug({ to: msg.from, mediaId }, 'Voice message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send voice message');
      throw err;
    }
  }

  async sendVideo(msg: StandardMessage, mediaId: string, title?: string, description?: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyMedia(frame, 'video', mediaId, { title, description });
      await saveOutgoingMessage(msg, 'video', null, mediaId);
      logger.debug({ to: msg.from, mediaId }, 'Video message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send video message');
      throw err;
    }
  }

  async sendFile(msg: StandardMessage, mediaId: string): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyMedia(frame, 'file', mediaId);
      await saveOutgoingMessage(msg, 'file', null, mediaId);
      logger.debug({ to: msg.from, mediaId }, 'File message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send file message');
      throw err;
    }
  }

  async sendTemplateCard(msg: StandardMessage, card: TemplateCard): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyTemplateCard(frame, card);
      await saveOutgoingMessage(msg, 'template_card', JSON.stringify(card));
      logger.debug({ to: msg.from }, 'Template card sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send template card');
      throw err;
    }
  }

  async sendStream(msg: StandardMessage, streamId: string, content: string, finish: boolean): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyStream(frame, streamId, content, finish);
      if (finish) {
        await saveOutgoingMessage(msg, 'stream', content);
      }
      logger.debug({ to: msg.from, streamId, finish }, 'Stream message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send stream message');
      throw err;
    }
  }

  async sendStreamWithCard(
    msg: StandardMessage,
    streamId: string,
    content: string,
    finish: boolean,
    card: TemplateCard
  ): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.replyStreamWithCard(frame, streamId, content, finish, { templateCard: card });
      logger.debug({ to: msg.from, streamId, finish }, 'Stream with card sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send stream with card');
      throw err;
    }
  }

  async updateTemplateCard(msg: StandardMessage, card: TemplateCard, userids?: string[]): Promise<void> {
    try {
      const frame = msg.raw as WsFrame;
      await this.client.updateTemplateCard(frame, card, userids);
      logger.debug({ to: msg.from }, 'Template card updated');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to update template card');
      throw err;
    }
  }

  generateStreamId(): string {
    return generateReqId('stream');
  }

  async uploadMedia(fileBuffer: Buffer, type: 'image' | 'voice' | 'video' | 'file', filename: string): Promise<string> {
    try {
      const result = await this.client.uploadMedia(fileBuffer, { type, filename });
      logger.debug({ type, mediaId: result.media_id }, 'Media uploaded');
      return result.media_id;
    } catch (err) {
      logger.error({ err, type }, 'Failed to upload media');
      throw err;
    }
  }

  async downloadFile(url: string, aesKey: string): Promise<{ buffer: Buffer; filename?: string }> {
    try {
      const result = await this.client.downloadFile(url, aesKey);
      logger.debug({ url }, 'File downloaded');
      return result;
    } catch (err) {
      logger.error({ err, url }, 'Failed to download file');
      throw err;
    }
  }

  async pushMessage(chatid: string, content: string): Promise<void> {
    try {
      await this.client.sendMessage(chatid, {
        msgtype: 'markdown',
        markdown: { content },
      });
      logger.debug({ chatid, content }, 'Push message sent');
    } catch (err) {
      logger.error({ err, chatid }, 'Failed to push message');
      throw err;
    }
  }

  async pushMediaMessage(chatid: string, type: 'image' | 'voice' | 'video' | 'file', mediaId: string): Promise<void> {
    try {
      await this.client.sendMediaMessage(chatid, type, mediaId);
      logger.debug({ chatid, type, mediaId }, 'Push media message sent');
    } catch (err) {
      logger.error({ err, chatid }, 'Failed to push media message');
      throw err;
    }
  }

  setMessageHandler(handler: (msg: StandardMessage) => void): void {
    this.onMessage = handler;
  }

  setEventHandler(handler: (event: WeComEvent) => void): void {
    this.onEvent = handler;
  }

  connect(): void {
    this.client.connect();

    this.client.on('authenticated', () => {
      logger.info('WeCom WebSocket authenticated');
    });

    this.client.on('message', (frame: WsFrame) => {
      const body = frame.body as Record<string, unknown>;
      const msgtype = body.msgtype as string;
      logger.debug({ msgtype, msgid: body.msgid }, 'Received message');
      this.handleMessage(frame, msgtype);
    });

    this.client.on('event', (frame: WsFrame) => {
      const body = frame.body as Record<string, unknown>;
      const eventType = (body.event as Record<string, string>)?.eventtype;
      logger.debug({ eventType, frame }, 'Received event');
      
      if (eventType === 'enter_chat') {
        this.handleEnterChat(frame);
      }
    });

    this.client.on('disconnected', () => {
      logger.warn('WeCom WebSocket disconnected');
    });

    this.client.on('error', (err: Error) => {
      logger.error({ err }, 'WeCom WebSocket error');
    });
  }

  private async handleEnterChat(frame: WsFrame): Promise<void> {
    logger.info({ frame }, 'User entered chat');
    if (this.onEvent) {
      this.onEvent({ type: 'enter_chat', frame });
    }
    try {
      await this.client.replyWelcome(frame, {
        msgtype: 'text',
        text: { content: '你好！我是 CarrotBot，发送 /help 查看可用命令。' },
      });
    } catch (err) {
      logger.error({ err }, 'Failed to send welcome message');
    }
  }

  private async handleMessage(frame: WsFrame, msgtype: string): Promise<void> {
    const msg = this.parseMessage(frame);
    
    try {
      await saveIncomingMessage(msg, (url, aesKey) => this.downloadFile(url, aesKey));
      logger.info({ msgtype, msgid: (frame.body as Record<string, unknown>)?.msgid, from: msg.from }, 'Message saved');
    } catch (err) {
      logger.error({ err, msgtype, msgid: (frame.body as Record<string, unknown>)?.msgid }, 'Failed to save incoming message');
    }

    if (this.onMessage) {
      this.onMessage(msg);
    }
  }

  disconnect(): void {
    this.client.disconnect();
    logger.info('WeCom WebSocket disconnected');
  }
}
