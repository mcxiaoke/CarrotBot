/**
 * 管理页面路由模块
 */

import type { FastifyInstance, FastifyReply } from 'fastify'
import { queryMessages } from '../storage/database.js'

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/admin', async (request, reply) => {
        return serveAdminPage(reply)
    })

    fastify.get('/admin/', async (request, reply) => {
        return serveAdminPage(reply)
    })
}

async function serveAdminPage(reply: FastifyReply): Promise<void> {
    const messages = queryMessages({ limit: 50 })
    const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CarrotBot Admin</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f5f5f5; padding: 20px; }
        h1 { color: #333; margin-bottom: 20px; }
        table { width: 100%; border-collapse: collapse; background: white; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        th, td { padding: 12px; text-align: left; border-bottom: 1px solid #eee; }
        th { background: #4a90d9; color: white; font-weight: 500; }
        tr:hover { background: #f9f9f9; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
        .badge-in { background: #e3f2fd; color: #1976d2; }
        .badge-out { background: #f3e5f5; color: #7b1fa2; }
        .platform-wecom { background: #fff3e0; color: #e65100; }
        .platform-telegram { background: #e8f5e9; color: #388e3c; }
        .content { max-width: 300px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .time { color: #666; font-size: 13px; }
    </style>
</head>
<body>
    <h1>🥕 CarrotBot Messages</h1>
    <table>
        <thead>
            <tr>
                <th>ID</th>
                <th>时间</th>
                <th>平台</th>
                <th>方向</th>
                <th>类型</th>
                <th>用户</th>
                <th>内容</th>
            </tr>
        </thead>
        <tbody>
            ${messages
                .map(
                    (m) => `
            <tr>
                <td>${m.id}</td>
                <td class="time">${m.created_at}</td>
                <td><span class="badge platform-${m.platform}">${m.platform}</span></td>
                <td><span class="badge badge-${m.direction}">${m.direction}</span></td>
                <td>${m.msgtype}</td>
                <td>${m.userid || '-'}</td>
                <td class="content" title="${(m.content || '').replace(/"/g, '&quot;')}">${m.content || '-'}</td>
            </tr>`
                )
                .join('')}
        </tbody>
    </table>
</body>
</html>`
    reply.type('text/html; charset=utf-8').send(html)
}
