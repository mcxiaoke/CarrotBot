import { createServer } from './server.js';
import { MessageRouter } from './core/router.js';
import { WeComAdapter } from './adapters/wecom.js';
import { TelegramAdapter } from './adapters/telegram.js';
import { PingAction } from './actions/ping.js';
import { HelpAction } from './actions/help.js';
import { DebugAction } from './actions/debug.js';
import { LanAction } from './actions/lan.js';
import { initLanService } from './router/lan_service.js';
import { initMessageStore, closeMessageStore } from './storage/message-store.js';
import { pushService } from './services/push.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.PORT || '3123', 10);
const ROUTER_IP = process.env.ROUTER_IP || '';
const ROUTER_PASSWORD = process.env.ROUTER_PASSWORD || '';
const DATA_PATH = process.env.DATA_PATH || './data';

const TELEGRAM_PROXY_TYPE = process.env.TELEGRAM_PROXY_TYPE as 'http' | 'socks' | undefined;
const TELEGRAM_PROXY_HOST = process.env.TELEGRAM_PROXY_HOST || '';
const TELEGRAM_PROXY_PORT = parseInt(process.env.TELEGRAM_PROXY_PORT || '0', 10);

async function main() {
  initMessageStore({
    dbPath: `${DATA_PATH}/messages.db`,
    cachePath: `${DATA_PATH}/cache`,
  });
  logger.info('MessageStore initialized');

  const router = new MessageRouter();
  router.register(new PingAction());
  router.register(new HelpAction(router));
  router.register(new LanAction());
  router.setDefault(new DebugAction());

  if (ROUTER_IP && ROUTER_PASSWORD) {
    await initLanService({
      routerIp: ROUTER_IP,
      routerPassword: ROUTER_PASSWORD,
      refreshInterval: 20_000,
    });
    logger.info('LAN Service initialized');
  } else {
    logger.warn('LAN Service disabled: ROUTER_IP or ROUTER_PASSWORD not set');
  }

  const adapters: { name: string; adapter: WeComAdapter | TelegramAdapter }[] = [];

  const wecomBotId = process.env.WECOM_BOT_ID || '';
  const wecomBotSecret = process.env.WECOM_BOT_SECRET || '';
  if (wecomBotId && wecomBotSecret) {
    const wecomAdapter = new WeComAdapter({
      botId: wecomBotId,
      botSecret: wecomBotSecret,
    });

    wecomAdapter.setMessageHandler((msg) => {
      router.dispatch(msg, wecomAdapter);
    });

    wecomAdapter.connect();
    adapters.push({ name: 'wecom', adapter: wecomAdapter });
    logger.info('WeCom adapter connected');
  } else {
    logger.warn('WeCom adapter disabled: WECOM_BOT_ID or WECOM_BOT_SECRET not set');
  }

  const telegramToken = process.env.TELEGRAM_BOT_TOKEN || '';
  if (telegramToken) {
    const proxyConfig = TELEGRAM_PROXY_TYPE && TELEGRAM_PROXY_HOST && TELEGRAM_PROXY_PORT
      ? {
          type: TELEGRAM_PROXY_TYPE,
          host: TELEGRAM_PROXY_HOST,
          port: TELEGRAM_PROXY_PORT,
        }
      : undefined;

    const telegramAdapter = new TelegramAdapter({
      token: telegramToken,
      proxy: proxyConfig,
    });

    telegramAdapter.setMessageHandler((msg) => {
      router.dispatch(msg, telegramAdapter);
    });

    telegramAdapter.connect();
    adapters.push({ name: 'telegram', adapter: telegramAdapter });
    logger.info('Telegram adapter connected');
  } else {
    logger.warn('Telegram adapter disabled: TELEGRAM_BOT_TOKEN not set');
  }

  const fastify = await createServer();

  const shutdown = () => {
    logger.info('Shutting down...');
    pushService.stop();
    for (const { name, adapter } of adapters) {
      adapter.disconnect();
      logger.info(`${name} adapter disconnected`);
    }
    closeMessageStore();
    fastify.close().then(() => {
      process.exit(0);
    });
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  await fastify.listen({ port: PORT, host: '0.0.0.0' });
  logger.info(`Server running on http://0.0.0.0:${PORT}`);
}

main().catch((err) => {
  logger.error(err, 'Failed to start server');
  process.exit(1);
});
