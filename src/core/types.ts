export interface StandardMessage {
  platform: string;
  from: string;
  content: string;
  raw: unknown;
}

export interface IAdapter {
  readonly platform: string;
  parseMessage(raw: unknown): StandardMessage;
  sendMessage(msg: StandardMessage, content: string): Promise<void>;
}

export interface IAction {
  readonly name: string;
  readonly description: string;
  match(content: string): boolean;
  execute(msg: StandardMessage, adapter: IAdapter): Promise<void>;
}
