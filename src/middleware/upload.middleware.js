import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { v4 as uuidv4 } from 'uuid';
import appEvents from '../events/appEvents.js';

// ─── Ensure Upload Directories Exist (FS sync example) ───────────────────────
const UPLOAD_ROOT = 'uploads';
const PRODUCTS_DIR = path.join(UPLOAD_ROOT, 'products');
const TEMP_DIR = path.join(UPLOAD_ROOT, 'temp');

// fs.mkdirSync — SYNCHRONOUS FS usage
[UPLOAD_ROOT, PRODUCTS_DIR, TEMP_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    console.log(`[FS Sync] Created directory: ${dir}`);
  }
});

// ─── Storage Engine ───────────────────────────────────────────────────────────
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, PRODUCTS_DIR);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const uniqueName = `${uuidv4()}${ext}`;
    cb(null, uniqueName);
  },
});

// ─── File Filter ──────────────────────────────────────────────────────────────
const imageFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error(`Invalid file type: ${file.mimetype}. Only JPEG, PNG, WEBP, GIF allowed.`), false);
  }
};

// ─── Multer Instances ─────────────────────────────────────────────────────────
const upload = multer({
  storage,
  fileFilter: imageFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5 MB
    files: 5,                   // max 5 images per product
  },
});

/**
 * Single file upload middleware
 * Usage: router.post('/product', uploadSingle, controller)
 */
export const uploadSingle = (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (req.file) {
      // Emit event after upload — EventEmitter concept
      appEvents.emitFileUploaded({
        filename: req.file.filename,
        size: req.file.size,
        mimetype: req.file.mimetype,
      });

      // Log asynchronously using fs.appendFile — ASYNC FS example
      const logLine = `[${new Date().toISOString()}] UPLOAD: ${req.file.originalname} → ${req.file.filename}\n`;
      fs.appendFile('logs/uploads.log', logLine, (err) => {
        if (err) { console.error('[FS Async] Log write failed:', err.message); }
      });
    }

    next();
  });
};

/**
 * Multiple files upload (up to 5 images)
 * Usage: router.post('/product', uploadMultiple, controller)
 */
export const uploadMultiple = (req, res, next) => {
  upload.array('images', 5)(req, res, (err) => {
    if (err) {
      return res.status(400).json({ success: false, message: err.message });
    }

    if (req.files?.length) {
      req.files.forEach((file) => {
        appEvents.emitFileUploaded({ filename: file.filename, size: file.size });
      });

      // fs.writeFile — ASYNC FS: save upload manifest
      const manifest = req.files.map((f) => ({
        filename: f.filename,
        original: f.originalname,
        size: f.size,
        uploadedAt: new Date().toISOString(),
      }));

      fs.writeFile(
        path.join(TEMP_DIR, `manifest-${Date.now()}.json`),
        JSON.stringify(manifest, null, 2),
        (err) => {
          if (err) { console.error('[FS Async] Manifest write failed:', err.message); }
        }
      );
    }

    next();
  });
};

/**
 * Build image URL and metadata from an uploaded file
 */
export const buildImageMeta = (file, baseUrl = '') => ({
  filename: file.filename,
  originalName: file.originalname,
  mimetype: file.mimetype,
  size: file.size,
  path: file.path,
  url: `${baseUrl}/uploads/products/${file.filename}`,
});

/**
 * Delete a file from disk (async)
 */
export const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    fs.unlink(filePath, (err) => {
      if (err && err.code !== 'ENOENT') { reject(err); } else { resolve(); }
    });
  });
};

/**
 * Read a file synchronously (for small config/template files)
 * SYNC FS example
 */
export const readFileSync = (filePath) => {
  return fs.readFileSync(filePath, 'utf-8');
};

/**
 * Read a file asynchronously (for large files — non-blocking)
 * ASYNC FS example
 */
export const readFileAsync = (filePath) => {
  return fs.promises.readFile(filePath, 'utf-8');
};
