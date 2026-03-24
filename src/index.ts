import { createServer } from './server.js';
import { MessageRouter } from './core/router.js';
import { WeComAdapter } from './adapters/wecom.js';
import { PingAction } from './actions/ping.js';
import { HelpAction } from './actions/help.js';
import { DebugAction } from './actions/debug.js';
import { logger } from './logger.js';

const PORT = parseInt(process.env.PORT || '3123', 10);

async function main() {
  const router = new MessageRouter();
  router.register(new PingAction());
  router.register(new HelpAction(router));
  router.setDefault(new DebugAction());

  const wecomAdapter = new WeComAdapter({
    botId: process.env.WECOM_BOT_ID || '',
    botSecret: process.env.WECOM_BOT_SECRET || '',
  });

  wecomAdapter.setMessageHandler((msg) => {
    router.dispatch(msg, wecomAdapter);
  });

  wecomAdapter.connect();

  const fastify = await createServer();

  const shutdown = () => {
    logger.info('Shutting down...');
    wecomAdapter.disconnect();
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
