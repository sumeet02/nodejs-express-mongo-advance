import { createClient } from 'redis';

/**
 * RedisClient — use of class with pub/sub + caching
 * Demonstrates: Redis connection, pub/sub channels, caching helpers
 */
class RedisClient {
  constructor() {
    this.client = null;
    this.subscriber = null;
    this.publisher = null;
  }

  async connect(url) {
    // Main client for get/set/cache
    this.client = createClient({ url });
    this.client.on('error', (err) => console.error('Redis Client Error:', err));
    this.client.on('connect', () => console.log('✅ Redis connected'));
    await this.client.connect();


    /* When a Redis client subscribes to a channel, it enters a special mode where it can only run 
       subscribe/unsubscribe commands. It can't do get, set, del or anything else anymore. 
       Problem if you use the same client:

      Using same client for everything — BREAKS
          await this.client.subscribe('order:placed', handler); // now client is in subscribe mode
          await this.client.set('key', 'value'); // ❌ ERROR — client is locked in subscribe mode
          await this.client.get('key');          // ❌ ERROR — same reason


      duplicate() copies all the config (URL, password, options) from the original client — 
      so you don't have to pass the connection string again. Just a convenience method.

    */

    // Dedicated subscriber (cannot run other commands while subscribed)
    this.subscriber = this.client.duplicate();
    await this.subscriber.connect();

    // Dedicated publisher
    this.publisher = this.client.duplicate();
    await this.publisher.connect();


    return this;
  }

  // ─── Cache Helpers ────────────────────────────────────────────────────────

  async get(key) {
    const val = await this.client.get(key);
    return val ? JSON.parse(val) : null;
  }

  async set(key, value, ttlSeconds = 3600) {
    await this.client.set(key, ttlSeconds, JSON.stringify(value));
  }

  async del(key) {
    await this.client.del(key);
  }

  async delPattern(pattern) {
    const keys = await this.client.keys(pattern);
    if (keys.length) {
      await this.client.del(keys);
    }
  }

  // ─── Pub / Sub ────────────────────────────────────────────────────────────

  async publish(channel, message) {
    const payload = typeof message === 'string' ? message : JSON.stringify(message);
    await this.publisher.publish(channel, payload);
  }

  async subscribe(channel, handler) {
    await this.subscriber.subscribe(channel, (message) => {
      try {
        handler(JSON.parse(message));
      } catch {
        handler(message);
      }
    });
  }

  // ─── Lists (queue-like) ───────────────────────────────────────────────────

  async lpush(key, value) {
    await this.client.lPush(key, JSON.stringify(value));
  }

  async rpop(key) {
    const val = await this.client.rPop(key);
    return val ? JSON.parse(val) : null;
  }

  // ─── Sorted Sets (leaderboards, rate limiting) ────────────────────────────

  async zadd(key, score, member) {
    await this.client.zAdd(key, [{ score, value: member }]);
  }

  async zrange(key, start, stop) {
    return this.client.zRange(key, start, stop, { REV: true });
  }

  async disconnect() {
    await this.client?.quit();
    await this.subscriber?.quit();
    await this.publisher?.quit();
  }
}

export default new RedisClient();
