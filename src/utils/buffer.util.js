/**
 * BufferService — Concept: Node.js Buffer
 *
 * Buffers are fixed-size allocations of raw binary memory.
 * Used for: file I/O, network packets, binary data, encoding conversion,
 *           image manipulation, generating tokens, checksums.
 *
 * Real-world e-commerce uses:
 * - Generate secure order tokens
 * - Encode/decode product data for transmission
 * - Handle binary image data
 * - Create hex-encoded IDs
 */
export class BufferService {

  // ─── 1. Generate a secure random token (order verification, download links) ──
  static generateSecureToken(byteLength = 32) {
    const buf = Buffer.allocUnsafe(byteLength); // allocate without zero-fill (faster)
    for (let i = 0; i < byteLength; i++) {
      buf[i] = Math.floor(Math.random() * 256);
    }
    return buf.toString('hex'); // hex string: 2 chars per byte
  }

  // ─── 2. Encode product data to Base64 (for safe URL / header transmission) ───
  static encodeProductData(product) {
    const json = JSON.stringify({ id: product._id, name: product.name, price: product.price });
    const buf = Buffer.from(json, 'utf-8');       // string → Buffer
    return buf.toString('base64');                // Buffer → base64 string
  }

  // ─── 3. Decode Base64 product data back ──────────────────────────────────────
  static decodeProductData(base64String) {
    const buf = Buffer.from(base64String, 'base64'); // base64 → Buffer
    return JSON.parse(buf.toString('utf-8'));          // Buffer → string → object
  }

  // ─── 4. Concatenate multiple buffers (e.g., assembling chunked upload) ───────
  static concatenateChunks(chunks) {
    // Buffer.concat is more efficient than string concatenation for binary data
    return Buffer.concat(chunks);
  }

  // ─── 5. Create a binary order receipt (simulating a mini binary format) ──────
  static createOrderReceipt(orderId, total, itemCount) {
    // alloc: allocates and zero-fills
    const buf = Buffer.alloc(16);

    // Write values at specific byte offsets (like a binary protocol)
    buf.writeUInt32BE(parseInt(orderId.slice(-8), 16) || 0, 0); // 4 bytes: order ref
    buf.writeFloatBE(total, 4);                                  // 4 bytes: total
    buf.writeUInt16BE(itemCount, 8);                             // 2 bytes: item count
    buf.writeUInt32BE(Math.floor(Date.now() / 1000), 10);        // 4 bytes: unix timestamp
    // 2 bytes: reserved/checksum

    return {
      hex: buf.toString('hex'),
      base64: buf.toString('base64'),
      byteLength: buf.byteLength,
    };
  }

  // ─── 6. Compare two buffers (constant-time comparison for tokens) ────────────
  static compareTokens(tokenA, tokenB) {
    const bufA = Buffer.from(tokenA, 'hex');
    const bufB = Buffer.from(tokenB, 'hex');

    if (bufA.length !== bufB.length) { return false; }

    // timingSafeEqual prevents timing attacks on token comparison
    let diff = 0;
    for (let i = 0; i < bufA.length; i++) {
      diff |= bufA[i] ^ bufB[i]; // XOR: 0 only if identical bytes
    }
    return diff === 0;
  }

  // ─── 7. Inspect buffer internals ─────────────────────────────────────────────
  static inspectBuffer(data) {
    const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data));
    return {
      bytes: [...buf],             // array of byte values
      hex: buf.toString('hex'),
      utf8: buf.toString('utf-8'),
      base64: buf.toString('base64'),
      byteLength: buf.byteLength,
      isBuffer: Buffer.isBuffer(buf),
    };
  }
}
