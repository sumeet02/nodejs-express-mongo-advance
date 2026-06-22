import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import path from 'path';
import { fileURLToPath } from 'url';

import router from './routes/index.js';
import { errorHandler, notFound, rateLimiter } from './middleware/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const createApp = () => {
  const app = express();

  // ─── Security Middlewares ────────────────────────────────────────────────────
  
  app.use(helmet());

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));
  app.use(rateLimiter);



  // ─── Request Parsing ─────────────────────────────────────────────────────────
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  

  // ─── Logging ─────────────────────────────────────────────────────────────────
  app.use(morgan('dev'));



  // ─── Static Files (uploaded images accessible via URL) ───────────────────────
  app.use('/uploads', express.static(path.join(process.cwd(), 'uploads')));



  // ─── API Routes ──────────────────────────────────────────────────────────────
  app.use('/api', router);

  // ─── Error Handling Middlewares ──────────────────────────────────────────────
  // notFound must come before errorHandler
  app.use(notFound);
  app.use(errorHandler);

  return app;
};

export default createApp;
