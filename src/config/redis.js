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

  /* OTHER TO STUDY 
    1. lpush --- rpop (queue)
    2. lpush --- lpop (stack) 

    $ const res9 = await this.client.lLen('bikes:repairs');
      console.log(res9); // 0

    $ await client.lMove('bikes:repairs', 'bikes:finished', 'LEFT', 'LEFT'); (remove source-left add dest-left)
      a. either both happen or neither happens ✅
      b. no data loss possible
      c. Available options are LEFT and RIGHT

    $ const res48 = await client.lPush('bikes:repairs', ['bike:1', 'bike:2', 'bike:3', 'bike:4', 'bike:5']);
      console.log(res48);  // 5  push multiple at time also.. lpush bcm bike:5, bike:4 ...

    $ client.lTrim(key, start, end)
      list → [A, B, C, D, E, F, G]
              0  1  2  3  4  5  6
             -7 -6 -5 -4 -3 -2 -1

    |--------------------------------------------------------------------|
      lTrim('list', 0, 4)   → [A, B, C, D, E]       // keep first 5
      lTrim('list', -5, -1) → [C, D, E, F, G]       // keep last 5
      lTrim('list', 1, -1)  → [B, C, D, E, F, G]    // remove first
      Trim('list', 0, -1)  → [A, B, C, D, E, F, G] // keep all
    |--------------------------------------------------------------------|


    $ Blocking operations on lists : -
    
      |--------------------------------------------------------------------|
        const job = await client.rPop('jobs');
        console.log(job);  //THIS IS NULL
      |--------------------------------------------------------------------|

      "If the list is empty, wait until an item arrives."- Instead of returning null, 
      Redis keeps the connection waiting."

      |--------------------------------------------------------------------|
      |  const result = await client.brPop('jobs', 0);
      |  console.log(result);
      |____________________________________________________________________|
      
      If the list is empty: Client waits... 
      once anything add into it.. gets removed OR If the timeout is reached, NULL is returned.

      Problems:-
        • Constant polling
        • Wasted CPU
        • Extra Redis requests

    $ const res37 = await client.set('new_bikes', 'bike:1');
      console.log(res37);  // store data normally

      const res39 = await client.lPush('new_bikes', 'bike:2', 'bike:3');
      ❌ redis.exceptions.ResponseError: [SimpleError: WRONGTYPE Operation against a key 
          holding the wrong kind of value]

    $ client.exists('bikes:repairs') - Return 0 or 1

  */

  
  // ─── Redis sets ──────────────────────────── 
  /*

    • Track unique items (e.g., track all unique IP addresses accessing a given blog post).
    • Represent relations (e.g., the set of all users with a given role).
    • Perform common set operations such as intersection, unions, and differences.

    |----------------------------------------------------------------------------------|
      $ ADD
       const res1 = await client.sAdd('bikes:racing:france', 'bike:1')
       const res2 = await client.sAdd('bikes:racing:usa', ['bike:2', 'bike:4'])
       const res2 = await client.sAdd('bikes:racing:india', ['bike:2', 'bike:3', 'bike:5'])
 
      $ CHECK IF EXIST
        const res5 = await client.sIsMember('bikes:racing:usa', 'bike:4')  >>> 1
        const res6 = await client.sIsMember('bikes:racing:india', 'bike:1') >>> 0

      $ CHECK IF EXIST - MULTIPLE
        const res12 = await client.smIsMember('bikes:racing:india', ['bike:3', 'bike:5', 'bike:4'])
            >>> [1, 1, 0]

      $ INTERSECTION
        const res7 = await client.sInter(['bikes:racing:india', 'bikes:racing:usa'])
        console.log(res7)  // >>> {'bike:2'}

      $ Get 
        const res10 = await client.sMembers('bikes:racing:france') >>> ['bike:1']

      $ DIFFERENCE :- (First Set - Second Set)
        Take all items from France --- Remove anything that also exists in USA

        const res13 = await client.sDiff(['bikes:racing:india', 'bikes:racing:usa'])
        >>> ['bike:3', 'bike:5']

      $ UNION
        const res15 = await client.sUnion(['bikes:racing:france', 'bikes:racing:usa'])
        >>> ['bike:1', 'bike:2', 'bike:4']

      $ REMOVE
        const res19 = await client.sRem('bikes:racing:france', 'bike:1')
        >>> 1   (1 member removed !!)

      $ GET RANDOM MEMBER
        const bike = await client.sRandMember('bikes:racing:india');
        >>> 'bike:2' OR 'bike:3' OR 'bike:5'

        const bike = await client.sRandMember('bikes:racing:india', 2);
        >>> ['bike:2', 'bike:3']

    |----------------------------------------------------------------------------------|





  */















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
