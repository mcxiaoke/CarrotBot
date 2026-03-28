/**
 * 管理页面路由模块
 */

import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { queryMessages } from '../storage/database.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const templatesDir = path.join(__dirname, 'templates')

function getApiToken(): string {
    return process.env.API_TOKEN || ''
}

function loadTemplate(name: string): string {
    const filePath = path.join(templatesDir, name)
    return fs.readFileSync(filePath, 'utf-8')
}

export async function registerAdminRoutes(fastify: FastifyInstance): Promise<void> {
    fastify.get('/admin/messages', async (request, reply) => {
        return serveMessagesPage(reply)
    })

    fastify.get('/admin/messages/', async (request, reply) => {
        return serveMessagesPage(reply)
    })

    fastify.get(
        '/admin/send',
        async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply) => {
            const urlToken = request.query.token || ''
            const envToken = getApiToken()
            const token = urlToken || envToken
            return serveSendPage(reply, token)
        }
    )

    fastify.get(
        '/admin/send/',
        async (request: FastifyRequest<{ Querystring: { token?: string } }>, reply) => {
            const urlToken = request.query.token || ''
            const envToken = getApiToken()
            const token = urlToken || envToken
            return serveSendPage(reply, token)
        }
    )
}

async function serveMessagesPage(reply: FastifyReply): Promise<void> {
    const messages = queryMessages({ limit: 50 })
    const template = loadTemplate('messages.html')

    const messagesHtml = messages
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
        .join('')

    const html = template.replace('{{MESSAGES}}', messagesHtml)
    reply.type('text/html; charset=utf-8').send(html)
}

async function serveSendPage(reply: FastifyReply, token: string): Promise<void> {
    const template = loadTemplate('send.html')

    const tokenQuery = token ? '?token=' + encodeURIComponent(token) : ''

    let html = template.replace('{{TOKEN_QUERY}}', tokenQuery)
    html = html.replace('{{API_TOKEN}}', token)

    reply.type('text/html; charset=utf-8').send(html)
}
