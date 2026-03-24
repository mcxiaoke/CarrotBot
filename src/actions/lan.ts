/**
 * LAN 命令处理器模块
 *
 * 实现 /lan 命令，用于显示局域网在线设备列表。
 * 需要配置 TP-Link 路由器连接信息才能使用。
 */

import type { IAction, StandardMessage, IAdapter } from '../core/types.js'
import { getLanService } from '../lan/service.js'

/**
 * LAN 命令处理器类
 *
 * 当用户发送 /lan 命令时，返回局域网在线设备列表。
 * 显示设备名称、IP 地址、MAC 地址、连接类型等信息。
 *
 * @example
 * 用户输入: /lan
 * 机器人回复:
 *   ## **局域网在线设备** (3 台)
 *   ---
 *
 *   **Device**: iPhone  无线/5G
 *   IP: 192.168.1.100  MAC: AA-BB-CC-DD-EE-FF
 *
 *   **Device**: MacBook  无线/WiFi6
 *   IP: 192.168.1.101  MAC: 11-22-33-44-55-66
 *
 *   ---
 *   更新时间: 2024/1/1 12:00:00
 */
export class LanAction implements IAction {
    /** 命令名称 */
    name = 'lan'

    /** 命令描述 */
    description = '显示局域网在线设备列表'

    /**
     * 判断消息是否匹配 /lan 命令
     * @param content - 消息文本内容
     * @returns 是否匹配
     */
    match(content: string): boolean {
        return content.trim() === '/lan' || content.trim() === '/lan '
    }

    /**
     * 执行 lan 命令
     *
     * 获取并显示局域网在线设备列表。
     * 设备按 IP 地址排序显示。
     *
     * @param msg - 标准消息对象
     * @param adapter - 平台适配器
     */
    async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
        // 获取 LAN 服务实例
        const lanService = getLanService()
        if (!lanService) {
            await adapter.sendMessage(msg, 'LAN 服务未初始化')
            return
        }

        // 获取在线设备列表
        const hosts = lanService.getHosts()
        if (hosts.length === 0) {
            await adapter.sendMessage(msg, '暂无在线设备')
            return
        }

        // 按 IP 地址排序设备
        const sortedHosts = hosts.sort((a, b) => {
            const aParts = a.ip.split('.').map(Number)
            const bParts = b.ip.split('.').map(Number)
            // 逐段比较 IP 地址
            for (let i = 0; i < 4; i++) {
                if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i]
            }
            return 0
        })

        // 构建回复消息
        const lines = [`## **局域网在线设备** (${hosts.length} 台)`, '---', '']

        // 添加每个设备的信息
        for (const host of sortedHosts) {
            lines.push(`**Device**: ${host.hostnameDecoded} ${host.wifiType}/${host.phyType}`)
            lines.push(`IP: ${host.ip}  MAC: ${host.mac}`)
            lines.push('')
        }

        // 添加更新时间
        lines.push(`---`)
        lines.push(`更新时间: ${lanService.getLastUpdate().toLocaleString('zh-CN')}`)
        lines.push('')

        // 使用 Markdown 格式发送（两个空格 + 换行符表示换行）
        await adapter.sendMessage(msg, lines.join('  \r\n'))
    }
}
