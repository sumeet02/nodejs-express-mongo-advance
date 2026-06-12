import { Router } from 'express';
import {
  createOrder,
  getOrders,
  getOrderById,
  updateOrderStatus,
  deleteOrder,
  exportOrdersCSV,
} from '../controllers/order.controller.js';
import { validateObjectId, cacheMiddleware } from '../middleware/index.js';

const router = Router();

router.get('/export/csv', exportOrdersCSV);

router.get('/', cacheMiddleware(120), getOrders);
router.post('/', createOrder);

router.get('/:id', validateObjectId, getOrderById);
router.patch('/:id/status', validateObjectId, updateOrderStatus);
router.delete('/:id', validateObjectId, deleteOrder);

export default router;
