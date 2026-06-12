import { Router } from 'express';
import productRoutes from './product.routes.js';
import orderRoutes from './order.routes.js';
import demoRoutes from './demo.routes.js';

const router = Router();

router.use('/products', productRoutes);
router.use('/orders', orderRoutes);
router.use('/demo', demoRoutes);

// Health check
router.get('/health', (_req, res) => {
  res.json({
    success: true,
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  });
});

export default router;
