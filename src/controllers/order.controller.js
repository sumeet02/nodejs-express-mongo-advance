import Order from '../models/order.model.js';
import Product from '../models/product.model.js';
import redis from '../config/redis.js';
import pubSubService from '../services/pubsub.service.js';
import appEvents from '../events/appEvents.js';
import { StreamService } from '../services/stream.service.js';
import path from 'path';

const successResponse = (res, data, status = 200) =>
  res.status(status).json({ success: true, ...data });

// ─── Create Order ─────────────────────────────────────────────────────────────
export const createOrder = async (req, res, next) => {
  try {
    const { customer, items, shippingAddress, notes } = req.body;

    // Validate products and calculate total
    let total = 0;
    const enrichedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.product);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.product} not found` });
      }
      if (product.stock < item.quantity) {
        return res.status(400).json({
          success: false,
          message: `Insufficient stock for "${product.name}". Available: ${product.stock}`,
        });
      }

      const price = product.discountedPrice || product.price;
      total += price * item.quantity;
      enrichedItems.push({ product: product._id, name: product.name, price, quantity: item.quantity });

      // Decrement stock
      product.stock -= item.quantity;
      await product.save();

      // Emit low stock event if threshold reached
      if (product.stock < 5) {
        await pubSubService.publishLowStock(product);
      }
    }

    const order = new Order({ customer, items: enrichedItems, total, shippingAddress, notes });
    await order.save();

    // Emit local EventEmitter event
    appEvents.emitOrderCreated(order);

    // Publish to Redis pub/sub (for other microservices / server instances)
    await pubSubService.publishOrderCreated(order);

    // Store in Redis list as a simple queue (e.g., for email worker)
    await redis.lpush('queue:order:notifications', {
      orderId: order._id,
      email: customer.email,
      orderNumber: order.orderNumber,
      total,
    });

    // Invalidate order list cache
    await redis.delPattern('cache:/api/orders*');

    successResponse(res, { order }, 201);
  } catch (err) {
    next(err);
  }
};

// ─── Get All Orders ───────────────────────────────────────────────────────────
export const getOrders = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const filter = {};
    if (status) { filter.status = status; }

    const skip = (Number(page) - 1) * Number(limit);
    const [orders, total] = await Promise.all([
      Order.find(filter).populate('items.product', 'name images').sort('-createdAt').skip(skip).limit(Number(limit)).lean(),
      Order.countDocuments(filter),
    ]);

    successResponse(res, {
      orders,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

// ─── Get Order By ID ──────────────────────────────────────────────────────────
export const getOrderById = async (req, res, next) => {
  try {
    const cacheKey = `order:${req.params.id}`;
    const cached = await redis.get(cacheKey);
    if (cached) { return successResponse(res, { order: cached, fromCache: true }); }

    const order = await Order.findById(req.params.id).populate('items.product', 'name images price').lean();
    if (!order) { return res.status(404).json({ success: false, message: 'Order not found' }); }

    await redis.set(cacheKey, order, 180);
    successResponse(res, { order });
  } catch (err) {
    next(err);
  }
};

// ─── Update Order Status ──────────────────────────────────────────────────────
export const updateOrderStatus = async (req, res, next) => {
  try {
    const { status } = req.body;
    const order = await Order.findByIdAndUpdate(
      req.params.id,
      { status },
      { new: true, runValidators: true }
    );

    if (!order) { return res.status(404).json({ success: false, message: 'Order not found' }); }

    await redis.del(`order:${req.params.id}`);
    await redis.delPattern('cache:/api/orders*');

    // Publish status change to Redis pub/sub
    await pubSubService.publishOrderStatusChange(order._id, status);

    successResponse(res, { order });
  } catch (err) {
    next(err);
  }
};

// ─── Delete Order ─────────────────────────────────────────────────────────────
export const deleteOrder = async (req, res, next) => {
  try {
    const order = await Order.findByIdAndDelete(req.params.id);
    if (!order) { return res.status(404).json({ success: false, message: 'Order not found' }); }

    await redis.del(`order:${req.params.id}`);
    await redis.delPattern('cache:/api/orders*');

    successResponse(res, { message: 'Order deleted' });
  } catch (err) {
    next(err);
  }
};

// ─── Export Orders CSV (Stream) ───────────────────────────────────────────────
export const exportOrdersCSV = async (req, res, next) => {
  try {
    const orders = await Order.find().lean();
    const flat = orders.map((o) => ({
      orderNumber: o.orderNumber,
      customer: o.customer.name,
      email: o.customer.email,
      total: o.total,
      status: o.status,
      paymentStatus: o.paymentStatus,
      createdAt: o.createdAt,
    }));

    const outputPath = path.join('uploads', 'temp', `orders-${Date.now()}.csv`);
    await StreamService.exportProductsToCSV(flat, outputPath);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="orders.csv"');
    StreamService.pipeFileToResponse(outputPath, res);
  } catch (err) {
    next(err);
  }
};
