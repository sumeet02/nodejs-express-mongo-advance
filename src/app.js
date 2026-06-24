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
  
  app.use(helmet()); // helmet.md use for study

  app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] }));

  /* OR

  assing array directly - origin : []

  OR

  const allowedOrigins = [
  "http://localhost:3000",
  "https://myapp.com",
  "https://admin.myapp.com",
  ];

  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true); // Allow request
        } else {
          callback(new Error("Not allowed by CORS"));
        }
      },
    })
  );
  

  */

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
