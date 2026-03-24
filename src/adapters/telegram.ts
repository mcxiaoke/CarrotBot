import TelegramBot from 'node-telegram-bot-api';
import axios from 'axios';
import type { Agent } from 'https';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { SocksProxyAgent } from 'socks-proxy-agent';
import type { IAdapter, StandardMessage, MessageType } from '../core/types.js';
import { saveIncomingMessage, saveOutgoingMessage, type TelegramDownloadFn } from '../storage/message-store.js';
import { logger } from '../logger.js';

export interface TelegramConfig {
  token: string;
  proxy?: {
    type: 'http' | 'socks';
    host: string;
    port: number;
  };
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 2000;

export class TelegramAdapter implements IAdapter {
  readonly platform = 'telegram';
  private bot: TelegramBot;
  private token: string;
  private proxyAgent: Agent | undefined;
  private onMessage: ((msg: StandardMessage) => void) | null = null;

  constructor(config: TelegramConfig) {
    this.token = config.token;
    const options: TelegramBot.ConstructorOptions = {
      polling: {
        interval: 300,
        autoStart: false,
        params: {
          timeout: 10,
        },
      },
    };

    if (config.proxy) {
      const { type, host, port } = config.proxy;
      const proxyUrl = type === 'socks'
        ? `socks5://${host}:${port}`
        : `http://${host}:${port}`;
      
      options.request = {
        proxy: proxyUrl,
      } as any;

      this.proxyAgent = type === 'socks'
        ? new SocksProxyAgent(proxyUrl)
        : new HttpsProxyAgent(proxyUrl);
      
      logger.info({ type, host, port, proxyUrl }, 'Telegram bot using proxy');
    }

    this.bot = new TelegramBot(config.token, options);
  }

  parseMessage(raw: unknown): StandardMessage {
    const msg = raw as TelegramBot.Message;
    let content = '';
    let msgType: MessageType = 'text';
    let mediaUrl: string | undefined;
    let mediaKey: string | undefined;

    if (msg.text) {
      content = msg.text;
      msgType = 'text';
    } else if (msg.photo) {
      content = '[图片]';
      msgType = 'image';
      const largestPhoto = msg.photo[msg.photo.length - 1];
      mediaUrl = largestPhoto?.file_id;
      logger.debug({ fileId: mediaUrl, photoSize: largestPhoto?.file_size }, 'Parsed Telegram photo');
    } else if (msg.voice) {
      content = '[语音]';
      msgType = 'voice';
      mediaUrl = msg.voice.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram voice');
    } else if (msg.video) {
      content = '[视频]';
      msgType = 'video';
      mediaUrl = msg.video.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram video');
    } else if (msg.document) {
      content = `[文件] ${msg.document.file_name || ''}`;
      msgType = 'file';
      mediaUrl = msg.document.file_id;
      logger.debug({ fileId: mediaUrl, fileName: msg.document.file_name }, 'Parsed Telegram document');
    } else if (msg.sticker) {
      content = '[贴纸]';
      msgType = 'image';
      mediaUrl = msg.sticker.file_id;
      logger.debug({ fileId: mediaUrl }, 'Parsed Telegram sticker');
    } else {
      content = '[未知消息]';
      msgType = 'text';
    }

    const from = msg.chat?.id?.toString() || '';

    return {
      platform: this.platform,
      from,
      content: content.trim(),
      msgType,
      raw,
      mediaUrl,
      mediaKey,
    };
  }

  async downloadFile(fileId: string): Promise<{ buffer: Buffer; filename?: string }> {
    logger.debug({ fileId }, 'Getting file info from Telegram');
    const file = await this.bot.getFile(fileId);
    
    if (!file.file_path) {
      throw new Error('File path not found in Telegram response');
    }

    const fileUrl = `https://api.telegram.org/file/bot${this.token}/${file.file_path}`;
    const filename = file.file_path.split('/').pop();

    let lastError: Error | null = null;
    
    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
      try {
        logger.debug({ fileId, fileUrl, fileSize: file.file_size, attempt }, 'Downloading Telegram file');

        const response = await axios.get(fileUrl, {
          responseType: 'arraybuffer',
          timeout: 30000,
          httpsAgent: this.proxyAgent,
        });

        const buffer = Buffer.from(response.data);

        logger.debug({ fileId, filename, size: buffer.length, attempt }, 'Telegram file downloaded');
        return { buffer, filename };
      } catch (err) {
        lastError = err as Error;
        logger.warn({ fileId, attempt, maxRetries: MAX_RETRIES, err: lastError.message }, 'Download attempt failed');
        
        if (attempt < MAX_RETRIES) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY * attempt));
        }
      }
    }

    logger.error({ err: lastError, fileId }, 'Failed to download Telegram file after all retries');
    throw lastError;
  }

  async sendMessage(msg: StandardMessage, content: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendMessage(chatId, content);
      await saveOutgoingMessage(msg, 'text', content);
      logger.debug({ to: msg.from, content }, 'Telegram message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram message');
      throw err;
    }
  }

  async sendText(msg: StandardMessage, content: string): Promise<void> {
    return this.sendMessage(msg, content);
  }

  async sendMarkdown(msg: StandardMessage, content: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendMessage(chatId, content, { parse_mode: 'MarkdownV2' });
      await saveOutgoingMessage(msg, 'markdown', content);
      logger.debug({ to: msg.from, content }, 'Telegram markdown message sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram markdown message');
      throw err;
    }
  }

  async sendImage(msg: StandardMessage, fileId: string, caption?: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendPhoto(chatId, fileId, { caption });
      await saveOutgoingMessage(msg, 'image', caption || null, fileId);
      logger.debug({ to: msg.from, fileId }, 'Telegram image sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram image');
      throw err;
    }
  }

  async sendDocument(msg: StandardMessage, fileId: string, caption?: string): Promise<void> {
    try {
      const chatId = parseInt(msg.from, 10);
      await this.bot.sendDocument(chatId, fileId, { caption });
      await saveOutgoingMessage(msg, 'file', caption || null, fileId);
      logger.debug({ to: msg.from, fileId }, 'Telegram document sent');
    } catch (err) {
      logger.error({ err, to: msg.from }, 'Failed to send Telegram document');
      throw err;
    }
  }

  setMessageHandler(handler: (msg: StandardMessage) => void): void {
    this.onMessage = handler;
  }

  connect(): void {
    this.bot.on('message', async (msg) => {
      const standardMsg = this.parseMessage(msg);

      try {
        await saveIncomingMessage(standardMsg, (fileId: string) => this.downloadFile(fileId));
        logger.info({ msgtype: standardMsg.msgType, from: standardMsg.from, hasMedia: !!standardMsg.mediaUrl }, 'Telegram message saved');
      } catch (err) {
        logger.error({ err, msgtype: standardMsg.msgType, from: standardMsg.from }, 'Failed to save Telegram message');
      }

      if (this.onMessage) {
        this.onMessage(standardMsg);
      }
    });

    this.bot.on('error', (err) => {
      logger.error({ err }, 'Telegram bot error');
    });

    this.bot.on('polling_error', (err) => {
      logger.error({ err: err.message }, 'Telegram polling error');
    });

    this.bot.startPolling();
    logger.info('Telegram bot started');
  }

  disconnect(): void {
    this.bot.stopPolling();
    logger.info('Telegram bot stopped');
  }

  getBot(): TelegramBot {
    return this.bot;
  }
}
