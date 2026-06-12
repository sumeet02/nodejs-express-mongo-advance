import { Readable, Writable, Duplex, Transform, pipeline } from 'stream';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';
import archiver from 'archiver';

const pipelineAsync = promisify(pipeline);

/**
 * StreamService — demonstrates all Node.js stream types
 *
 * Real-world e-commerce use cases:
 * - Export orders as CSV (Transform stream)
 * - Download product images as ZIP (pipe)
 * - Process large product imports (Readable → Transform → Writable)
 * - Real-time inventory updates (Duplex)
 */
export class StreamService {

  // ─── 1. Readable Stream ─────────────────────────────────────────────────────
  /**
   * Creates a Readable stream from an array of products.
   * Real use: streaming large DB result sets without loading all into memory.
   */
  static createProductReadable(products) {
    let index = 0;

    return new Readable({
      objectMode: true, // stream JS objects, not just Buffers
      read() {
        if (index < products.length) {
          this.push(products[index++]);
        } else {
          this.push(null); // signal end of stream
        }
      },
    });
  }

  // ─── 2. Writable Stream ─────────────────────────────────────────────────────
  /**
   * Writable stream that collects products into an array.
   * Real use: writing to DB in batches, or collecting stream output.
   */
  static createCollectorWritable(collector = []) {
    return new Writable({
      objectMode: true,
      write(chunk, _encoding, callback) {
        collector.push(chunk);
        callback(); // MUST call callback to signal "ready for next chunk"
      },
    });
  }

  // ─── 3. Transform Stream ────────────────────────────────────────────────────
  /**
   * Transform: Product object → CSV row string
   * Real use: Export orders/products as downloadable CSV.
   */
  static createCSVTransform(headers) {
    let headerWritten = false;

    return new Transform({
      objectMode: true, // input is objects, output is strings/Buffers
      transform(product, _encoding, callback) {
        if (!headerWritten) {
          this.push(headers.join(',') + '\n');
          headerWritten = true;
        }

        const row = headers.map((h) => {
          const val = product[h];
          // Wrap strings with commas in quotes
          if (typeof val === 'string' && val.includes(',')) {
            return `"${val}"`;
          }
          return val ?? '';
        });

        this.push(row.join(',') + '\n');
        callback();
      },
    });
  }

  // ─── 4. Duplex Stream ───────────────────────────────────────────────────────
  /**
   * Duplex: reads inventory data AND writes acknowledgements simultaneously.
   * Real use: bidirectional WebSocket-like inventory sync.
   */
  static createInventoryDuplex(inventoryItems) {
    let index = 0;
    const acks = [];

    return new Duplex({
      objectMode: true,

      // Readable side — pushes inventory items out
      read() {
        if (index < inventoryItems.length) {
          this.push({ item: inventoryItems[index++], timestamp: Date.now() });
        } else {
          this.push(null);
        }
      },

      // Writable side — receives acknowledgements
      write(ack, _encoding, callback) {
        acks.push(ack);
        console.log(`[Duplex] ACK received:`, ack);
        callback();
      },
    });
  }

  // ─── 5. Pipe: File Download ─────────────────────────────────────────────────
  /**
   * Pipe a file from disk directly to HTTP response.
   * Real use: serving product images / exports without loading into memory.
   */
  static pipeFileToResponse(filePath, res) {
    const fileStream = fs.createReadStream(filePath);

    fileStream.on('error', (err) => {
      if (err.code === 'ENOENT') {
        res.status(404).json({ success: false, message: 'File not found' });
      } else {
        res.status(500).json({ success: false, message: 'Stream error' });
      }
    });

    // .pipe() connects readable → writable, handles backpressure automatically
    fileStream.pipe(res);
  }

  // ─── 6. Pipeline: Products → CSV → File ─────────────────────────────────────
  /**
   * pipeline() is safer than pipe() — propagates errors and cleans up on failure.
   * Real use: export products to a CSV file on disk.
   */
  static async exportProductsToCSV(products, outputPath) {
    const headers = ['name', 'price', 'category', 'stock', 'brand'];

    const readable = this.createProductReadable(products);
    const csvTransform = this.createCSVTransform(headers);
    const fileWritable = fs.createWriteStream(outputPath);

    // pipeline: readable → transform → writable
    await pipelineAsync(readable, csvTransform, fileWritable);

    return outputPath;
  }

  // ─── 7. ZIP Archive with pipe ───────────────────────────────────────────────
  /**
   * Stream a ZIP archive of product images directly to HTTP response.
   * Real use: "Download all product images" feature.
   */
  static async streamImagesAsZip(imagePaths, res) {
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename="product-images.zip"');

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      res.status(500).json({ success: false, message: err.message });
    });

    // pipe archive output to response
    archive.pipe(res);

    for (const imgPath of imagePaths) {
      if (fs.existsSync(imgPath)) {
        archive.file(imgPath, { name: path.basename(imgPath) });
      }
    }

    await archive.finalize();
  }
}
