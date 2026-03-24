export type MessageType = 'text' | 'image' | 'voice' | 'video' | 'file' | 'mixed' | 'event';

export interface StandardMessage {
  platform: string;
  from: string;
  content: string;
  msgType: MessageType;
  raw: unknown;
  mediaUrl?: string;
  mediaKey?: string;
  aesKey?: string;
}

export interface IAdapter {
  readonly platform: string;
  parseMessage(raw: unknown): StandardMessage;
  sendMessage(msg: StandardMessage, content: string): Promise<void>;
  sendImage?(msg: StandardMessage, mediaId: string): Promise<void>;
  sendMarkdown?(msg: StandardMessage, content: string): Promise<void>;
  sendTemplateCard?(msg: StandardMessage, card: unknown): Promise<void>;
  sendStream?(msg: StandardMessage, streamId: string, content: string, finish: boolean): Promise<void>;
}

export interface IAction {
  readonly name: string;
  readonly description: string;
  match(content: string): boolean;
  execute(msg: StandardMessage, adapter: IAdapter): Promise<void>;
}
