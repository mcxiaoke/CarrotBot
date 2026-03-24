/**
 * 核心类型定义模块
 *
 * 本模块定义了 CarrotBot 的核心接口和类型，是整个系统的基础。
 * 所有平台适配器和命令处理器都基于这些接口实现。
 */

/**
 * 消息类型枚举
 *
 * 定义系统支持的消息类型，用于区分不同类型的消息内容
 */
export type MessageType = 'text' | 'image' | 'voice' | 'video' | 'file' | 'mixed' | 'event'

/**
 * 标准消息体接口
 *
 * 这是系统内部统一流转的消息格式，所有平台适配器都需要将原始消息转换为此格式。
 * 通过标准化消息格式，实现了平台无关的消息处理逻辑。
 */
export interface StandardMessage {
    /** 平台标识，如 'wecom' 或 'telegram' */
    platform: string

    /** 发送者标识，通常是会话 ID 或用户 ID */
    from: string

    /** 消息文本内容 */
    content: string

    /** 消息类型 */
    msgType: MessageType

    /** 原始消息数据，保留平台特定的完整信息 */
    raw: unknown

    /** 媒体文件 URL（可选） */
    mediaUrl?: string

    /** 媒体文件 Key（可选，用于企业微信） */
    mediaKey?: string

    /** AES 加密密钥（可选，用于企业微信媒体文件解密） */
    aesKey?: string
}

/**
 * 平台适配器接口
 *
 * 定义了所有平台适配器必须实现的方法。
 * 适配器负责将特定平台的消息转换为标准格式，并提供消息发送能力。
 *
 * @example
 * ```typescript
 * class WeComAdapter implements IAdapter {
 *   readonly platform = 'wecom';
 *   parseMessage(raw: unknown): StandardMessage { ... }
 *   sendMessage(msg: StandardMessage, content: string): Promise<void> { ... }
 * }
 * ```
 */
export interface IAdapter {
    /** 平台标识符 */
    readonly platform: string

    /**
     * 解析原始消息为标准格式
     * @param raw - 平台原始消息数据
     * @returns 标准化的消息对象
     */
    parseMessage(raw: unknown): StandardMessage

    /**
     * 发送文本消息
     * @param msg - 原始消息对象，用于获取回复目标
     * @param content - 要发送的内容
     */
    sendMessage(msg: StandardMessage, content: string): Promise<void>

    /**
     * 发送图片消息（可选）
     * @param msg - 原始消息对象
     * @param mediaId - 媒体文件 ID
     */
    sendImage?(msg: StandardMessage, mediaId: string): Promise<void>

    /**
     * 发送 Markdown 格式消息（可选）
     * @param msg - 原始消息对象
     * @param content - Markdown 格式内容
     */
    sendMarkdown?(msg: StandardMessage, content: string): Promise<void>

    /**
     * 发送模板卡片消息（可选，企业微信特有）
     * @param msg - 原始消息对象
     * @param card - 模板卡片数据
     */
    sendTemplateCard?(msg: StandardMessage, card: unknown): Promise<void>

    /**
     * 发送流式消息（可选，用于 AI 对话场景）
     * @param msg - 原始消息对象
     * @param streamId - 流标识符
     * @param content - 消息内容
     * @param finish - 是否为最后一条消息
     */
    sendStream?(
        msg: StandardMessage,
        streamId: string,
        content: string,
        finish: boolean
    ): Promise<void>
}

/**
 * 命令处理器接口
 *
 * 定义了命令处理器必须实现的方法。
 * 每个命令处理器负责处理特定格式的消息，并执行相应的业务逻辑。
 *
 * @example
 * ```typescript
 * class PingAction implements IAction {
 *   name = 'ping';
 *   description = '检查服务运行状态';
 *   match(content: string): boolean {
 *     return content.trim() === '/ping';
 *   }
 *   async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
 *     await adapter.sendMessage(msg, 'Pong!');
 *   }
 * }
 * ```
 */
export interface IAction {
    /** 命令名称，用于帮助信息展示 */
    readonly name: string

    /** 命令描述，用于帮助信息展示 */
    readonly description: string

    /**
     * 判断消息是否匹配此命令
     * @param content - 消息文本内容
     * @returns 是否匹配
     */
    match(content: string): boolean

    /**
     * 执行命令逻辑
     * @param msg - 标准消息对象
     * @param adapter - 平台适配器，用于发送回复
     */
    execute(msg: StandardMessage, adapter: IAdapter): Promise<void>
}
