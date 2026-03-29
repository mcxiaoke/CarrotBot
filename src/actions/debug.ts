/**
 * Debug 命令处理器模块
 *
 * 实现调试命令，用于显示消息的详细信息。
 * 此命令作为默认处理器，处理所有未匹配其他命令的消息。
 */

import type { IAction, StandardMessage, IAdapter } from '../core/types.js'

/**
 * 转义 Markdown 特殊字符
 *
 * Telegram 使用 MarkdownV2 格式，需要转义特殊字符。
 *
 * @param text - 原始文本
 * @returns 转义后的文本
 */
function escapeMarkdown(text: string): string {
    return text.replace(/[_*[\]()~`>#+\-=|{}.!\\]/g, '\\$&')
}

/**
 * Debug 命令处理器类
 *
 * 作为默认命令处理器，显示收到的消息的详细信息。
 * 包括平台、来源、消息类型、内容等，便于调试。
 *
 * 注意：match() 方法始终返回 false，因此不会主动匹配任何消息，
 * 只在作为默认处理器时被调用。
 *
 * @example
 * 当用户发送的消息不匹配任何命令时，机器人回复:
 *   📋 调试信息
 *   平台: wecom
 *   来源: xxx
 *   消息类型: text
 *   内容: hello
 */
export class DebugAction implements IAction {
    /** 命令名称 */
    name = 'debug'

    /** 命令描述 */
    description = '显示消息调试信息'

    /**
     * 判断消息是否匹配此命令
     *
     * 此方法始终返回 false，表示此命令不会主动匹配任何消息。
     * 此命令作为默认处理器使用。
     *
     * @returns 始终返回 false
     */
    match(): boolean {
        return false
    }

    /**
     * 执行调试命令
     *
     * 显示消息的详细信息，包括平台特定的字段。
     *
     * @param msg - 标准消息对象
     * @param adapter - 平台适配器
     */
    async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
        const raw = msg.raw as Record<string, unknown>

        // 构建基础调试信息
        const lines = [
            `📋 调试信息`,
            `平台: ${msg.platform}`,
            `来源: ${msg.from}`,
            `消息类型: ${msg.msgType}`,
            `内容: ${msg.content}`
        ]

        // 根据平台添加特定信息
        if (msg.platform === 'wecom') {
            // 企业微信特定字段
            const body = (raw?.body as Record<string, unknown>) || {}
            lines.push(`---`)
            lines.push(`chattype: ${body.chattype || 'N/A'}`)
            lines.push(`chatid: ${body.chatid || 'N/A'}`)
            lines.push(`userid: ${(body.from as Record<string, unknown>)?.userid || 'N/A'}`)
            lines.push(`msgid: ${body.msgid || 'N/A'}`)

            // 媒体文件信息
            if (msg.mediaUrl) lines.push(`mediaUrl: ${msg.mediaUrl}`)
            if (msg.mediaKey) lines.push(`mediaKey: ${msg.mediaKey}`)
            if (msg.aesKey) lines.push(`aesKey: ${msg.aesKey}`)
        } else if (msg.platform === 'telegram') {
            // Telegram 特定字段
            const tgMsg = raw as {
                chat?: { id?: number; type?: string }
                from?: { id?: number; username?: string }
                message_id?: number
                date?: number
            }
            lines.push(`---`)
            lines.push(`chat_id: ${tgMsg?.chat?.id || 'N/A'}`)
            lines.push(`chat_type: ${tgMsg?.chat?.type || 'N/A'}`)
            lines.push(`user_id: ${tgMsg?.from?.id || 'N/A'}`)
            lines.push(`username: ${tgMsg?.from?.username || 'N/A'}`)
            lines.push(`message_id: ${tgMsg?.message_id || 'N/A'}`)
            lines.push(`date: ${tgMsg?.date ? new Date(tgMsg.date * 1000).toISOString() : 'N/A'}`)

            // 媒体文件信息
            if (msg.mediaUrl) lines.push(`file_id: ${msg.mediaUrl}`)
        }

        const content = lines.join('\n')

        // Telegram 需要转义 Markdown 特殊字符
        if (msg.platform === 'telegram') {
            const escaped = escapeMarkdown(content)
            await adapter.sendMessage(msg, escaped)
        } else {
            await adapter.sendMessage(msg, content)
        }
    }
}
