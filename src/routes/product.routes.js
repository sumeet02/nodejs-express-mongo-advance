import { Router } from 'express';
import {
  getProducts,
  getProductById,
  createProduct,
  updateProduct,
  deleteProduct,
  exportProductsCSV,
  downloadProductImages,
  getProductAnalytics,
  applyBulkDiscount,
  getProductToken,
} from '../controllers/product.controller.js';
import { uploadSingle, uploadMultiple } from '../middleware/upload.middleware.js';
import { validateObjectId, cacheMiddleware } from '../middleware/index.js';

const router = Router();

// ─── Special Routes (before :id to avoid conflicts) ──────────────────────────
router.get('/export/csv', exportProductsCSV);
router.get('/export/images', downloadProductImages);
router.get('/analytics', getProductAnalytics);
router.post('/bulk-discount', applyBulkDiscount);

// ─── CRUD Routes ──────────────────────────────────────────────────────────────
router.get('/', cacheMiddleware(300), getProducts);

router.post('/', uploadMultiple, createProduct);         // multiple images upload
router.post('/single-image', uploadSingle, createProduct); // single image upload

router.get('/:id', validateObjectId, getProductById);
router.get('/:id/token', validateObjectId, getProductToken);

router.put('/:id', validateObjectId, uploadMultiple, updateProduct);
router.delete('/:id', validateObjectId, deleteProduct);

export default router;
