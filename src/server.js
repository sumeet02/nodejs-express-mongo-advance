import 'dotenv/config';
import createApp from './app.js';
import database from './config/database.js';
import redis from './config/redis.js';
import pubSubService from './services/pubsub.service.js';
import dns from 'node:dns';


const PORT = process.env.PORT || 3000;
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/ecommerce';
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';

async function bootstrap() {
  try {

    dns.setServers(['1.1.1.1', '8.8.8.8']); //REMEMBER - FROM NODE 24
   
    // Connect MongoDB
    await database.connect(MONGO_URI);

    // Connect Redis
    // await redis.connect(REDIS_URL);

    // Initialize Redis Pub/Sub subscriptions
    // NOTE: If Redis is unavailable, pub/sub won't work but app still runs
    try {
      await pubSubService.init();
    } catch (err) {
      console.warn('[PubSub] Redis pub/sub unavailable:', err.message);
    }

    // Create and start Express app
    const app = createApp();
    const server = app.listen(PORT, () => {
      console.log('\n═══════════════════════════════════════════════════');
      console.log(`  🚀  E-Commerce API running on http://localhost:${PORT}`);
      console.log('═══════════════════════════════════════════════════');
      console.log('\n  📦  Routes:');
      console.log(`     GET  /api/health`);
      console.log(`     GET  /api/products`);
      console.log(`     POST /api/products          (multipart: images[])`);
      console.log(`     GET  /api/products/:id`);
      console.log(`     PUT  /api/products/:id`);
      console.log(`     DEL  /api/products/:id`);
      console.log(`     GET  /api/products/analytics`);
      console.log(`     GET  /api/products/export/csv`);
      console.log(`     GET  /api/products/export/images`);
      console.log(`     POST /api/orders`);
      console.log(`     GET  /api/orders`);
      console.log('\n  🧪  Demo Concept Routes:');
      console.log(`     GET  /api/demo/event-emitter`);
      console.log(`     GET  /api/demo/buffer?text=hello`);
      console.log(`     GET  /api/demo/streams`);
      console.log(`     GET  /api/demo/worker-thread`);
      console.log(`     GET  /api/demo/fs`);
      console.log(`     GET  /api/demo/redis`);
      console.log(`     GET  /api/demo/duplex`);
      console.log('═══════════════════════════════════════════════════\n');
    });

    // ─── Graceful Shutdown ──────────────────────────────────────────────────────
    const shutdown = async (signal) => {
      console.log(`\n[${signal}] Graceful shutdown initiated...`);
      server.close(async () => {
        await database.disconnect();
        await redis.disconnect();
        console.log('✅ Server shut down cleanly');
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Unhandled rejection guard
    process.on('unhandledRejection', (reason) => {
      console.error('Unhandled Rejection:', reason);
    });

  } catch (err) {
    console.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

bootstrap();
