import redis from '../config/redis.js';
import appEvents from '../events/appEvents.js';

/**
 * PubSubService — Concepts: Pub/Sub + Redis Communication
 *
 * Two types of pub/sub demonstrated:
 *
 * 1. LOCAL Pub/Sub — Node.js EventEmitter (in-process, same server)
 *    - Fast, zero network overhead
 *    - Only works within a single process
 *
 * 2. DISTRIBUTED Pub/Sub — Redis Pub/Sub (cross-process, cross-server)
 *    - Works across multiple Node.js instances (horizontal scaling)
 *    - Required in production with load balancers / multiple servers
 *
 * Real use: When Server A processes an order, it publishes to Redis.
 *           Server B (running a notification service) receives it and sends emails.
 */

// ─── Redis Channel Names ──────────────────────────────────────────────────────
export const CHANNELS = {
  ORDER_CREATED: 'ecom:order:created',
  ORDER_STATUS: 'ecom:order:status',
  PRODUCT_UPDATED: 'ecom:product:updated',
  LOW_STOCK: 'ecom:product:low_stock',
  CART_UPDATED: 'ecom:cart:updated',
};

class PubSubService {
  /**
   * Initialize all Redis subscribers.
   * Called once on app startup.
   */
  async init() {
    // Subscribe to order events
    await redis.subscribe(CHANNELS.ORDER_CREATED, (order) => {
      console.log(`[PubSub Redis] ORDER CREATED on channel ${CHANNELS.ORDER_CREATED}:`, order.orderNumber);
      // Trigger local EventEmitter so other in-process listeners can react
      appEvents.emitOrderCreated(order);
    });

    // Subscribe to stock alerts
    await redis.subscribe(CHANNELS.LOW_STOCK, (product) => {
      console.log(`[PubSub Redis] LOW STOCK alert:`, product.name);
      appEvents.emitProductLowStock(product);
    });

    // Subscribe to product updates (e.g., cache invalidation)
    await redis.subscribe(CHANNELS.PRODUCT_UPDATED, (data) => {
      console.log(`[PubSub Redis] Product updated, invalidating cache for id=${data.productId}`);
      redis.del(`cache:/api/products/${data.productId}`).catch(console.error);
    });

    console.log('✅ PubSub Redis subscriptions initialized');
  }

  // ─── Publishers ─────────────────────────────────────────────────────────────

  async publishOrderCreated(order) {
    await redis.publish(CHANNELS.ORDER_CREATED, order);
  }

  async publishOrderStatusChange(orderId, newStatus) {
    await redis.publish(CHANNELS.ORDER_STATUS, { orderId, status: newStatus, updatedAt: new Date() });
  }

  async publishProductUpdated(productId) {
    await redis.publish(CHANNELS.PRODUCT_UPDATED, { productId });
  }

  async publishLowStock(product) {
    await redis.publish(CHANNELS.LOW_STOCK, {
      name: product.name,
      stock: product.stock,
      productId: product._id,
    });
  }
}

export default new PubSubService();
