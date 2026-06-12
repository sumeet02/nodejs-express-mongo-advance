# 🛒 E-Commerce API — Node.js Concepts in Practice

A production-structured Express + MongoDB e-commerce REST API that demonstrates **10 core Node.js concepts** through real-world examples.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Copy env file
cp .env.example .env

# 3. Start MongoDB and Redis locally, then:
npm run dev
```

---

## 📁 Project Structure

```
src/
├── config/
│   ├── database.js        ← MongoDB singleton (class pattern)
│   └── redis.js           ← Redis client (pub/sub + cache)
├── controllers/
│   ├── product.controller.js
│   ├── order.controller.js
│   └── demo.controller.js ← Isolated concept demos
├── events/
│   └── appEvents.js       ← App-wide EventEmitter bus
├── middleware/
│   ├── index.js           ← errorHandler, cache, rateLimiter, asyncHandler
│   └── upload.middleware.js ← multer, FS sync/async
├── models/
│   ├── product.model.js
│   └── order.model.js
├── routes/
│   ├── index.js           ← Route aggregator
│   ├── product.routes.js
│   ├── order.routes.js
│   └── demo.routes.js
├── services/
│   ├── stream.service.js  ← All stream types
│   └── pubsub.service.js  ← Redis pub/sub
├── utils/
│   └── buffer.util.js     ← Buffer operations
├── workers/
│   ├── product.worker.js  ← Worker thread script
│   └── worker.service.js  ← Worker thread manager
├── app.js                 ← Express app factory
└── server.js              ← Bootstrap & graceful shutdown
```

---

## 🧠 Concepts Guide

### 1. File Upload — `src/middleware/upload.middleware.js`

**Single upload:**
```
POST /api/products/single-image
Content-Type: multipart/form-data
Field: image (single file)
```

**Multiple upload (up to 5):**
```
POST /api/products
Content-Type: multipart/form-data
Field: images[] (multiple files)
```

- Uses `multer` with `diskStorage` for custom filenames (UUID-based)
- File filter validates MIME type
- After upload: fires `EventEmitter` event + writes async log with `fs.appendFile`
- Also writes a JSON manifest with `fs.writeFile` (async)

---

### 2. FS — Sync vs Async — `src/middleware/upload.middleware.js` + demo

```
GET /api/demo/fs
```

| Method | When to Use |
|---|---|
| `fs.mkdirSync()` | Startup scripts — OK to block before server starts |
| `fs.readFileSync()` | Config files loaded once at boot |
| `fs.appendFile(cb)` | Logging in request handlers — non-blocking |
| `fs.promises.readFile()` | Modern async/await style |

---

### 3. Redis — `src/config/redis.js`

```
GET /api/demo/redis
```

Three clients for three purposes:
- `client` → get/set/cache, lists, sorted sets
- `subscriber` → dedicated to subscribe (can't run other commands while subscribed)
- `publisher` → dedicated to publish

**Operations demonstrated:**
```js
redis.set(key, value, ttlSeconds)   // cache with expiry
redis.get(key)                      // cache read
redis.lpush(key, value)             // push to list (queue)
redis.rpop(key)                     // pop from list
redis.zadd(key, score, member)      // sorted set (leaderboard)
redis.publish(channel, message)     // pub/sub publish
```

---

### 4. Streams — `src/services/stream.service.js`

```
GET /api/demo/streams          → Transform demo (products → CSV)
GET /api/demo/duplex           → Duplex demo
GET /api/products/export/csv   → Real CSV download via pipeline
GET /api/products/export/images → Real ZIP download via pipe
```

| Type | Direction | Real Use |
|---|---|---|
| `Readable` | OUT only | DB cursor, file read |
| `Writable` | IN only | File write, HTTP response |
| `Transform` | IN → transform → OUT | CSV encoder, gzip |
| `Duplex` | IN + OUT independently | TCP socket, inventory sync |

**pipe vs pipeline:**
```js
// pipe — simple but doesn't propagate errors
readable.pipe(transform).pipe(writable);

// pipeline — safer, cleans up on error (use this in production)
await pipeline(readable, transform, writable);
```

---

### 5. Worker Threads — `src/workers/`

```
GET /api/demo/worker-thread
GET /api/products/analytics     ← 100 products analyzed off main thread
POST /api/products/bulk-discount
```

```
Main Thread (Event Loop)          Worker Thread (Separate OS Thread)
─────────────────────────         ─────────────────────────────────
Handles HTTP requests      ←───   CPU-heavy analytics / calculations
Stays responsive           ────→  Processes 10,000 products
Never blocked              ←───   Posts result back via message
```

**Key points:**
- Workers share NO memory by default — safe, no race conditions
- Communicate via `parentPort.postMessage()` / `worker.on('message')`
- Use for CPU-bound tasks only; async/await is enough for I/O

---

### 6. EventEmitter — `src/events/appEvents.js`

```
GET /api/demo/event-emitter
```

```js
// Emit
appEvents.emit('order:created', order);

// Listen (persistent)
appEvents.on('order:created', (order) => { /* runs every time */ });

// Listen (once)
appEvents.once('demo:ping', (data) => { /* runs once, then removed */ });
```

**Difference from pub/sub:**
- EventEmitter = in-process only (same Node.js instance)
- Redis pub/sub = cross-process (multiple servers, microservices)

---

### 7. Pub/Sub — `src/services/pubsub.service.js`

```
GET /api/demo/redis   ← publishes to Redis channel
```

**Flow:**
```
Server A: creates order
  → redis.publish('ecom:order:created', order)

Server B (or same): subscribed to channel
  → handler fires → sends email, updates analytics
```

**Channels:**
- `ecom:order:created`
- `ecom:order:status`
- `ecom:product:updated`
- `ecom:product:low_stock`

---

### 8. Buffer — `src/utils/buffer.util.js`

```
GET /api/demo/buffer?text=HelloWorld
GET /api/products/:id/token
```

```js
// Create
Buffer.from('hello', 'utf-8')        // from string
Buffer.alloc(16)                      // zero-filled allocation
Buffer.allocUnsafe(32)                // faster, not zero-filled

// Encodings
buf.toString('hex')                   // binary → hex string
buf.toString('base64')                // binary → base64
buf.toString('utf-8')                 // binary → text

// Useful for
// - Secure tokens (random bytes → hex)
// - Encoding data for headers/URLs (utf-8 → base64)
// - Binary protocols (writeUInt32BE, writeFloatBE)
// - Assembling chunked uploads (Buffer.concat)
```

---

### 9. Middleware + next() — `src/middleware/index.js`

```js
// Normal middleware: does something, then calls next()
app.use((req, res, next) => {
  req.startTime = Date.now();
  next();                   // ← pass control to next middleware/route
});

// Error middleware: 4 params, called when next(err) is invoked
app.use((err, req, res, next) => {
  res.status(500).json({ message: err.message });
});

// Calling next(err) from anywhere routes to error handler:
router.get('/product/:id', async (req, res, next) => {
  try { ... }
  catch (err) { next(err); } // ← skips all normal middleware
});
```

**Middlewares in this project:**
| Middleware | Purpose |
|---|---|
| `errorHandler` | 4-param global error handler |
| `notFound` | 404 catcher before errorHandler |
| `cacheMiddleware(ttl)` | Factory: returns middleware with config |
| `validateObjectId` | Guards :id params |
| `rateLimiter` | Express rate-limit |
| `asyncHandler(fn)` | Wraps async fn, auto-calls next(err) |

---

### 10. Class Usage — `src/config/database.js`, `redis.js`, `src/utils/buffer.util.js`

```js
// Singleton class — one DB instance shared across app
class Database {
  constructor() { this.connection = null; }
  async connect(uri) { ... }
  async disconnect() { ... }
}
export default new Database(); // ← singleton

// Static utility class — no state, pure functions
class BufferService {
  static generateSecureToken(bytes) { ... }
  static encodeProductData(product) { ... }
}
```

---

## 📡 API Reference

### Products
| Method | Route | Description |
|---|---|---|
| GET | `/api/products` | List (paginated, filtered, cached) |
| POST | `/api/products` | Create + upload images (multipart) |
| GET | `/api/products/:id` | Get by ID (Redis cached) |
| PUT | `/api/products/:id` | Update + add images |
| DELETE | `/api/products/:id` | Delete + remove images from disk |
| GET | `/api/products/analytics` | Worker thread analytics |
| GET | `/api/products/export/csv` | CSV download via stream |
| GET | `/api/products/export/images` | ZIP download via pipe |
| POST | `/api/products/bulk-discount` | Worker thread bulk pricing |
| GET | `/api/products/:id/token` | Buffer encoding demo |

### Orders
| Method | Route | Description |
|---|---|---|
| GET | `/api/orders` | List orders |
| POST | `/api/orders` | Create order (publishes to Redis) |
| GET | `/api/orders/:id` | Get by ID |
| PATCH | `/api/orders/:id/status` | Update status |
| DELETE | `/api/orders/:id` | Delete |
| GET | `/api/orders/export/csv` | Export CSV via stream |

### Demo Routes
| Route | Concept |
|---|---|
| `GET /api/demo/event-emitter` | EventEmitter |
| `GET /api/demo/buffer?text=hi` | Buffer |
| `GET /api/demo/streams` | All stream types |
| `GET /api/demo/worker-thread` | Worker Threads |
| `GET /api/demo/fs` | FS sync vs async |
| `GET /api/demo/redis` | Redis operations |
| `GET /api/demo/duplex` | Duplex stream |
