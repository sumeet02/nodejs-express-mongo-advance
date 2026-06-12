/**
 * DemoController — Isolated demonstrations of every concept
 *
 * Route prefix: /api/demo
 * These routes exist purely for learning/testing each concept individually.
 */

import { Readable, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';
import redis from '../config/redis.js';
import appEvents from '../events/appEvents.js';
import { BufferService } from '../utils/buffer.util.js';
import { StreamService } from '../services/stream.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pipelineAsync = promisify(pipeline);

// ─── 1. EventEmitter Demo ─────────────────────────────────────────────────────
export const demoEventEmitter = (req, res) => {
  const events = [];

  // Add a one-time listener
  appEvents.once('demo:ping', (data) => {
    events.push({ event: 'demo:ping received', data });
  });

  // Emit the event
  appEvents.emit('demo:ping', { message: 'Hello from EventEmitter!', ts: Date.now() });

  // Show listener count
  const listenerCount = appEvents.listenerCount('order:created');

  res.json({
    success: true,
    concept: 'EventEmitter',
    events,
    listenerCount_for_order_created: listenerCount,
    note: 'EventEmitter is Node\'s built-in pub/sub for in-process events. Use .on() for persistent, .once() for one-time listeners.',
  });
};

// ─── 2. Buffer Demo ────────────────────────────────────────────────────────────
export const demoBuffer = (req, res) => {
  const text = req.query.text || 'Hello, E-Commerce!';

  // Various Buffer operations
  const buf = Buffer.from(text, 'utf-8');
  const token = BufferService.generateSecureToken(16);
  const encoded = BufferService.encodeProductData({ _id: '507f1f77bcf86cd799439011', name: text, price: 999 });
  const receipt = BufferService.createOrderReceipt('507f1f77bcf86cd799439011', 4999, 3);

  res.json({
    success: true,
    concept: 'Buffer',
    input: text,
    buffer: {
      hex: buf.toString('hex'),
      base64: buf.toString('base64'),
      bytes: [...buf],
      byteLength: buf.byteLength,
    },
    secureToken: token,
    encodedProduct: encoded,
    decodedProduct: BufferService.decodeProductData(encoded),
    binaryReceipt: receipt,
    note: 'Buffer holds raw binary data. Used for file I/O, network, encoding, tokens.',
  });
};

// ─── 3. Streams Demo ──────────────────────────────────────────────────────────
export const demoStreams = async (req, res, next) => {
  try {
    const products = [
      { name: 'Laptop', price: 75000, category: 'electronics', stock: 10, brand: 'Dell' },
      { name: 'T-Shirt', price: 499, category: 'clothing', stock: 200, brand: 'H&M' },
      { name: 'Node.js Book', price: 1200, category: 'books', stock: 50, brand: 'OReilly' },
    ];

    // Collect transform output
    const chunks = [];
    const readable = StreamService.createProductReadable(products);
    const csvTransform = StreamService.createCSVTransform(['name', 'price', 'category', 'stock', 'brand']);
    const collector = new Transform({
      transform(chunk, _enc, cb) { chunks.push(chunk.toString()); cb(); },
    });

    await pipelineAsync(readable, csvTransform, collector);

    res.json({
      success: true,
      concept: 'Streams',
      types: {
        Readable: 'Produces data (DB cursor, file read)',
        Writable: 'Consumes data (file write, HTTP response)',
        Transform: 'Reads + transforms + writes (CSV encoder, compression)',
        Duplex: 'Both readable and writable independently (TCP socket)',
      },
      csv_output: chunks.join(''),
      note: 'pipeline() is safer than pipe() — handles errors and cleanup automatically.',
    });
  } catch (err) {
    next(err);
  }
};

// ─── 4. Worker Thread Demo ────────────────────────────────────────────────────
export const demoWorkerThread = (req, res) => {
  const products = Array.from({ length: 100 }, (_, i) => ({
    _id: `prod${i}`,
    name: `Product ${i}`,
    price: Math.floor(Math.random() * 10000) + 100,
    stock: Math.floor(Math.random() * 50),
    category: ['electronics', 'clothing', 'books'][i % 3],
    ratings: { average: Math.random() * 5 },
  }));

  const workerPath = path.join(__dirname, '../workers/product.worker.js');

  const worker = new Worker(workerPath, {
    workerData: { task: 'analytics', data: { products } },
  });

  worker.on('message', (result) => {
    res.json({
      success: true,
      concept: 'Worker Threads',
      note: 'This ran in a SEPARATE OS thread — the event loop was not blocked.',
      analytics: result.result,
    });
  });

  worker.on('error', (err) => {
    res.status(500).json({ success: false, message: err.message });
  });
};

// ─── 5. FS Sync vs Async Demo ─────────────────────────────────────────────────
export const demoFS = async (req, res) => {
  const results = {};
  const tmpFile = path.join('uploads', 'temp', `fs-demo-${Date.now()}.txt`);

  // SYNC — blocks event loop until complete
  const startSync = Date.now();
  fs.writeFileSync(tmpFile, 'Hello from sync write!\n');
  const syncContent = fs.readFileSync(tmpFile, 'utf-8');
  results.sync = { content: syncContent.trim(), duration_ms: Date.now() - startSync };

  // ASYNC — non-blocking, uses callbacks
  await new Promise((resolve) => {
    const startAsync = Date.now();
    fs.appendFile(tmpFile, 'Hello from async append!\n', () => {
      fs.readFile(tmpFile, 'utf-8', (err, data) => {
        results.async = { content: data?.trim(), duration_ms: Date.now() - startAsync };
        resolve();
      });
    });
  });

  // ASYNC with Promises (fs.promises)
  const startPromise = Date.now();
  await fs.promises.appendFile(tmpFile, 'Hello from promises!\n');
  const promiseContent = await fs.promises.readFile(tmpFile, 'utf-8');
  results.promises = { content: promiseContent.trim(), duration_ms: Date.now() - startPromise };

  // Cleanup
  fs.unlink(tmpFile, () => {});

  res.json({
    success: true,
    concept: 'File System (FS)',
    note: 'Use sync only for startup scripts. Use async (callbacks or promises) in request handlers.',
    results,
  });
};

// ─── 6. Redis Demo ────────────────────────────────────────────────────────────
export const demoRedis = async (req, res, next) => {
  try {
    const key = 'demo:counter';
    const now = Date.now();

    // Set
    await redis.set(key, { value: now, msg: 'Redis is working!' }, 60);

    // Get
    const val = await redis.get(key);

    // List operations
    await redis.lpush('demo:queue', { task: 'send_email', to: 'user@example.com', ts: now });
    const nextTask = await redis.rpop('demo:queue');

    // Sorted set (leaderboard)
    await redis.zadd('demo:leaderboard', Math.floor(Math.random() * 100), `user_${now}`);
    const top = await redis.zrange('demo:leaderboard', 0, 4);

    // Pub/sub publish (subscriber is already listening in PubSubService)
    await redis.publish('ecom:order:created', { orderNumber: `DEMO-${now}`, total: 999 });

    res.json({
      success: true,
      concept: 'Redis',
      operations: {
        set_and_get: val,
        queue_pop: nextTask,
        leaderboard_top5: top,
        pubsub: 'Published to ecom:order:created channel',
      },
      note: 'Redis: caching (get/set), queues (lpush/rpop), leaderboards (zadd/zrange), pub/sub.',
    });
  } catch (err) {
    next(err);
  }
};

// ─── 7. Duplex Stream Demo ────────────────────────────────────────────────────
export const demoDuplex = async (req, res, next) => {
  try {
    const inventoryItems = [
      { sku: 'ELEC-001', stock: 15 },
      { sku: 'CLO-002', stock: 3 },
      { sku: 'BOOK-003', stock: 42 },
    ];

    const acks = [];
    const duplex = StreamService.createInventoryDuplex(inventoryItems);

    const received = [];
    duplex.on('data', (chunk) => {
      received.push(chunk);
      // Write acknowledgement back through the writable side
      duplex.write({ ack: `OK:${chunk.item.sku}`, receivedAt: Date.now() });
    });

    await new Promise((resolve) => duplex.on('end', resolve));

    res.json({
      success: true,
      concept: 'Duplex Stream',
      note: 'Duplex is both readable AND writable simultaneously. Like a TCP socket.',
      received_items: received,
      acknowledgements: acks,
    });
  } catch (err) {
    next(err);
  }
};
