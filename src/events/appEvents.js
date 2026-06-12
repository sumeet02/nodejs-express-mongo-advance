import { EventEmitter } from 'events';

/**
 * AppEventEmitter — Concept: EventEmitter
 *
 * Central event bus for the application.
 * Used to decouple modules: e.g. after an order is placed, emit 'order:created'
 * and let the notification, inventory, and analytics modules react independently.
 */
class AppEventEmitter extends EventEmitter {
  constructor() {
    super();
    this.setMaxListeners(20); // allow many subscribers
  }

  // Typed emit helpers for autocomplete / clarity
  emitOrderCreated(order) {
    this.emit('order:created', order);
  }

  emitProductLowStock(product) {
    this.emit('product:low_stock', product);
  }

  emitUserRegistered(user) {
    this.emit('user:registered', user);
  }

  emitFileUploaded(fileInfo) {
    this.emit('file:uploaded', fileInfo);
  }
}

// Singleton — shared event bus across the app
const appEvents = new AppEventEmitter();

// ─── Default Listeners (logging / side-effects) ───────────────────────────────

appEvents.on('order:created', (order) => {
  console.log(`[EVENT] order:created → orderId=${order._id}, total=₹${order.total}`);
});

appEvents.on('product:low_stock', (product) => {
  console.warn(`[EVENT] product:low_stock → ${product.name} has ${product.stock} units left`);
});

appEvents.on('user:registered', (user) => {
  console.log(`[EVENT] user:registered → ${user.email}`);
});

appEvents.on('file:uploaded', (fileInfo) => {
  console.log(`[EVENT] file:uploaded → ${fileInfo.filename} (${fileInfo.size} bytes)`);
});

export default appEvents;
