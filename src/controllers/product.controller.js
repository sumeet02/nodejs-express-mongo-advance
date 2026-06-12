import Product from '../models/product.model.js';
import redis from '../config/redis.js';
import { StreamService } from '../services/stream.service.js';
import workerService from '../workers/worker.service.js';
import pubSubService from '../services/pubsub.service.js';
import appEvents from '../events/appEvents.js';
import { BufferService } from '../utils/buffer.util.js';
import { buildImageMeta, deleteFile } from '../middleware/upload.middleware.js';
import path from 'path';

const CACHE_TTL = 300; // 5 minutes

// ─── Helpers ──────────────────────────────────────────────────────────────────
const successResponse = (res, data, statusCode = 200) =>
  res.status(statusCode).json({ success: true, ...data });

const notFoundError = (res, msg = 'Product not found') =>
  res.status(404).json({ success: false, message: msg });

// ─── CRUD Controllers ─────────────────────────────────────────────────────────

/**
 * GET /api/products
 * Lists products with optional filters, pagination, Redis cache
 */
export const getProducts = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, category, minPrice, maxPrice, search, sort = '-createdAt' } = req.query;

    const filter = { isActive: true };
    if (category) { filter.category = category; }
    if (minPrice || maxPrice) {
      filter.price = {};
      if (minPrice) { filter.price.$gte = Number(minPrice); }
      if (maxPrice) { filter.price.$lte = Number(maxPrice); }
    }
    if (search) { filter.$text = { $search: search }; }

    const skip = (Number(page) - 1) * Number(limit);
    const [products, total] = await Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(Number(limit)).lean(),
      Product.countDocuments(filter),
    ]);

    successResponse(res, {
      products,
      pagination: { page: Number(page), limit: Number(limit), total, pages: Math.ceil(total / limit) },
    });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/:id
 * Get single product — with Redis cache
 */
export const getProductById = async (req, res, next) => {
  try {
    const cacheKey = `product:${req.params.id}`;

    // Check Redis first
    const cached = await redis.get(cacheKey);
    if (cached) {
      return successResponse(res, { product: cached, fromCache: true });
    }

    const product = await Product.findById(req.params.id).lean();
    if (!product) { return notFoundError(res); }

    // Store in Redis
    await redis.set(cacheKey, product, CACHE_TTL);

    successResponse(res, { product });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products
 * Create product — supports multiple image upload
 * Demonstrates: file upload, EventEmitter, Buffer token
 */
export const createProduct = async (req, res, next) => {
  try {
    const productData = { ...req.body };

    // Handle multiple uploaded images (multer puts them in req.files)
    if (req.files?.length) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      productData.images = req.files.map((file) => buildImageMeta(file, baseUrl));
    } else if (req.file) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      productData.images = [buildImageMeta(req.file, baseUrl)];
    }

    // Parse tags if sent as JSON string
    if (typeof productData.tags === 'string') {
      try { productData.tags = JSON.parse(productData.tags); } catch { /* ignore */ }
    }

    const product = new Product(productData);
    await product.save();

    // Generate a secure Buffer-based token for this product
    const productToken = BufferService.generateSecureToken(16);
    await redis.set(`product:token:${product._id}`, productToken, 86400);

    // Emit local event
    appEvents.emit('product:created', { id: product._id, name: product.name });

    // Check stock and emit low stock if needed
    if (product.stock < 5) {
      pubSubService.publishLowStock(product);
    }

    // Invalidate product list cache
    await redis.delPattern('cache:/api/products*');

    successResponse(res, { product, token: productToken }, 201);
  } catch (err) {
    next(err);
  }
};

/**
 * PUT /api/products/:id
 * Update product — invalidates Redis cache, publishes update via Redis pub/sub
 */
export const updateProduct = async (req, res, next) => {
  try {
    const updateData = { ...req.body };

    if (req.files?.length) {
      const baseUrl = `${req.protocol}://${req.get('host')}`;
      updateData.$push = {
        images: { $each: req.files.map((f) => buildImageMeta(f, baseUrl)) },
      };
      delete updateData.images;
    }

    const product = await Product.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true, runValidators: true }
    );

    if (!product) { return notFoundError(res); }

    // Invalidate specific product cache
    await redis.del(`product:${req.params.id}`);
    await redis.delPattern('cache:/api/products*');

    // Publish update to all server instances (Redis Pub/Sub)
    await pubSubService.publishProductUpdated(req.params.id);

    // Low stock check after update
    if (product.stock < 5) {
      await pubSubService.publishLowStock(product);
    }

    successResponse(res, { product });
  } catch (err) {
    next(err);
  }
};

/**
 * DELETE /api/products/:id
 * Delete product and its images from disk
 */
export const deleteProduct = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) { return notFoundError(res); }

    // Delete image files from disk (async fs)
    if (product.images?.length) {
      await Promise.all(
        product.images.map((img) => deleteFile(img.path).catch(console.error))
      );
    }

    await Product.findByIdAndDelete(req.params.id);
    await redis.del(`product:${req.params.id}`);
    await redis.delPattern('cache:/api/products*');

    successResponse(res, { message: 'Product deleted successfully' });
  } catch (err) {
    next(err);
  }
};

// ─── Stream Export ────────────────────────────────────────────────────────────

/**
 * GET /api/products/export/csv
 * Export products as CSV using Transform stream — streams directly to client
 */
export const exportProductsCSV = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).lean();
    const outputPath = path.join('uploads', 'temp', `export-${Date.now()}.csv`);

    await StreamService.exportProductsToCSV(products, outputPath);

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="products.csv"');

    // Stream the file to response using pipe
    StreamService.pipeFileToResponse(outputPath, res);
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/products/export/images
 * Download all product images as ZIP — streams archive to client
 */
export const downloadProductImages = async (req, res, next) => {
  try {
    const products = await Product.find({ isActive: true }).lean();
    const imagePaths = products.flatMap((p) => (p.images || []).map((img) => img.path));

    await StreamService.streamImagesAsZip(imagePaths, res);
  } catch (err) {
    next(err);
  }
};

// ─── Worker Thread Analytics ──────────────────────────────────────────────────

/**
 * GET /api/products/analytics
 * Heavy analytics computed in a worker thread — doesn't block event loop
 */
export const getProductAnalytics = async (req, res, next) => {
  try {
    const cacheKey = 'analytics:products';
    const cached = await redis.get(cacheKey);
    if (cached) { return successResponse(res, { analytics: cached, fromCache: true }); }

    const products = await Product.find({ isActive: true }).lean();

    // Offload CPU work to worker thread
    const analytics = await workerService.calculateAnalytics(products);

    await redis.set(cacheKey, analytics, 600); // cache 10 min
    successResponse(res, { analytics });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/products/bulk-discount
 * Apply bulk discount using worker thread
 */
export const applyBulkDiscount = async (req, res, next) => {
  try {
    const { discountPercent = 10, category } = req.body;
    const filter = { isActive: true };
    if (category) { filter.category = category; }

    const products = await Product.find(filter).lean();

    // CPU work in worker thread
    const discounted = await workerService.applyBulkDiscount(products, discountPercent);

    successResponse(res, { discounted, total: discounted.length });
  } catch (err) {
    next(err);
  }
};

// ─── Buffer Demo ──────────────────────────────────────────────────────────────

/**
 * GET /api/products/:id/token
 * Demonstrates Buffer encoding for product data sharing
 */
export const getProductToken = async (req, res, next) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product) { return notFoundError(res); }

    const encoded = BufferService.encodeProductData(product);
    const decoded = BufferService.decodeProductData(encoded);
    const receipt = BufferService.createOrderReceipt(product._id.toString(), product.price, product.stock);
    const inspection = BufferService.inspectBuffer(product.name);

    successResponse(res, {
      buffer_demo: {
        encoded_base64: encoded,
        decoded: decoded,
        receipt,
        inspection,
      },
    });
  } catch (err) {
    next(err);
  }
};
