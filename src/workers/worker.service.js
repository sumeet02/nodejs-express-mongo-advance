import { Worker } from 'worker_threads';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * WorkerService — Concept: Worker Threads
 *
 * Node.js is single-threaded. Heavy CPU tasks (image processing, report generation,
 * bulk calculations) will BLOCK the event loop and slow ALL requests.
 *
 * Worker Threads run in separate OS threads — they don't block the event loop.
 * They communicate with the main thread via message passing (postMessage / on('message')).
 *
 * Key points:
 * - Workers share no memory by default (safe, no race conditions)
 * - SharedArrayBuffer / Atomics can be used for shared memory (advanced)
 * - Use for CPU-bound tasks; for I/O-bound tasks, async/await is sufficient
 */
class WorkerService {
  /**
   * Run a task in a worker thread
   * @param {string} workerPath - path to the worker script
   * @param {object} workerData - data to pass to the worker
   * @returns {Promise} resolves with worker result
   */
  runWorker(workerPath, workerData) {
    return new Promise((resolve, reject) => {
      const worker = new Worker(workerPath, { workerData });

      worker.on('message', (result) => {
        if (result.success) {
          resolve(result.result);
        } else {
          reject(new Error(result.error));
        }
      });

      worker.on('error', reject);

      worker.on('exit', (code) => {
        if (code !== 0) {
          reject(new Error(`Worker exited with code ${code}`));
        }
      });
    });
  }

  /**
   * Calculate product analytics in a worker thread
   * Real use: dashboard stats, admin reports — heavy aggregation off the main thread
   */
  async calculateAnalytics(products) {
    const workerPath = path.join(__dirname, 'product.worker.js');
    return this.runWorker(workerPath, { task: 'analytics', data: { products } });
  }

  /**
   * Apply bulk discount in a worker thread
   * Real use: sale events, flash discounts on thousands of products
   */
  async applyBulkDiscount(products, discountPercent) {
    const workerPath = path.join(__dirname, 'product.worker.js');
    return this.runWorker(workerPath, {
      task: 'bulkDiscount',
      data: { products, discountPercent },
    });
  }
}

export default new WorkerService();
