/**
 * productWorker.js — Worker Thread Script
 *
 * This file runs in a SEPARATE THREAD via workerThreads.
 * It receives a task, processes it, and posts the result back to the main thread.
 *
 * Real use: CPU-intensive tasks like:
 * - Image resizing / thumbnail generation
 * - Bulk price calculations
 * - Report generation with heavy aggregation
 */

import { workerData, parentPort } from 'worker_threads';

const { task, data } = workerData;

/**
 * Heavy computation: calculate analytics for a list of products.
 * This would block the event loop if run in the main thread.
 */
function calculateProductAnalytics(products) {
  const result = {
    totalProducts: products.length,
    totalValue: 0,
    avgPrice: 0,
    byCategory: {},
    priceRanges: { under1000: 0, '1000to5000': 0, above5000: 0 },
    lowStock: [],
    topRated: [],
  };

  for (const p of products) {
    result.totalValue += p.price * p.stock;

    // Category breakdown
    result.byCategory[p.category] = (result.byCategory[p.category] || 0) + 1;

    // Price ranges
    if (p.price < 1000) { result.priceRanges.under1000++; }
    else if (p.price <= 5000) { result.priceRanges['1000to5000']++; }
    else { result.priceRanges.above5000++; }

    // Low stock alert (< 5 units)
    if (p.stock < 5) {
      result.lowStock.push({ id: p._id, name: p.name, stock: p.stock });
    }

    // Top rated (>= 4 stars)
    if (p.ratings?.average >= 4) {
      result.topRated.push({ id: p._id, name: p.name, rating: p.ratings.average });
    }
  }

  result.avgPrice = products.length
    ? Math.round(result.totalValue / products.length)
    : 0;

  // Sort top rated descending
  result.topRated.sort((a, b) => b.rating - a.rating);

  return result;
}

/**
 * Bulk discount calculation — another CPU task
 */
function applyBulkDiscount(products, discountPercent) {
  return products.map((p) => ({
    id: p._id,
    name: p.name,
    originalPrice: p.price,
    discountedPrice: Math.round(p.price * (1 - discountPercent / 100)),
    savings: Math.round(p.price * (discountPercent / 100)),
  }));
}

// ─── Task Router ───────────────────────────────────────────────────────────────
try {
  let result;

  switch (task) {
    case 'analytics':
      result = calculateProductAnalytics(data.products);
      break;
    case 'bulkDiscount':
      result = applyBulkDiscount(data.products, data.discountPercent);
      break;
    default:
      throw new Error(`Unknown task: ${task}`);
  }

  // Post result back to main thread
  parentPort.postMessage({ success: true, result });
} catch (err) {
  parentPort.postMessage({ success: false, error: err.message });
}
