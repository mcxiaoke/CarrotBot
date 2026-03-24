import type { IAction, StandardMessage, IAdapter } from '../core/types.js';
import { getLanService } from '../router/lan_service.js';

export class LanAction implements IAction {
  name = 'lan';
  description = '显示局域网在线设备列表';

  match(content: string): boolean {
    return content.trim() === '/lan' || content.trim() === '/lan ';
  }

  async execute(msg: StandardMessage, adapter: IAdapter): Promise<void> {
    const lanService = getLanService();
    if (!lanService) {
      await adapter.sendMessage(msg, 'LAN 服务未初始化');
      return;
    }

    const hosts = lanService.getHosts();
    if (hosts.length === 0) {
      await adapter.sendMessage(msg, '暂无在线设备');
      return;
    }

    const sortedHosts = hosts.sort((a, b) => {
      const aParts = a.ip.split('.').map(Number);
      const bParts = b.ip.split('.').map(Number);
      for (let i = 0; i < 4; i++) {
        if (aParts[i] !== bParts[i]) return aParts[i] - bParts[i];
      }
      return 0;
    });

    const lines = [
      `## **局域网在线设备** (${hosts.length} 台)`,
      '---',
      '',
    ];

    for (const host of sortedHosts) {
      lines.push(`**Device**: ${host.hostnameDecoded} ${host.wifiType}/${host.phyType}`);
      lines.push(`IP: ${host.ip}  MAC: ${host.mac}`);
      lines.push('');
    }

    lines.push(`---`);
    lines.push(`更新时间: ${lanService.getLastUpdate().toLocaleString('zh-CN')}`);
    lines.push('');

    await adapter.sendMessage(msg, lines.join('  \r\n'));
  }
}
