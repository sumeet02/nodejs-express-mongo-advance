import mongoose from 'mongoose';

const imageSchema = new mongoose.Schema({
  filename: { type: String, required: true },
  originalName: { type: String, required: true },
  mimetype: { type: String, required: true },
  size: { type: Number, required: true },
  path: { type: String, required: true },
  url: { type: String, required: true },
}, { _id: true });

const productSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Product name is required'],
      trim: true,
      maxlength: [200, 'Name cannot exceed 200 characters'],
    },
    slug: {
      type: String,
      unique: true,
      lowercase: true,
    },
    description: {
      type: String,
      required: [true, 'Description is required'],
      maxlength: [2000, 'Description cannot exceed 2000 characters'],
    },
    price: {
      type: Number,
      required: [true, 'Price is required'],
      min: [0, 'Price cannot be negative'],
    },
    discountedPrice: {
      type: Number,
      min: [0, 'Discounted price cannot be negative'],
    },
    category: {
      type: String,
      required: true,
      enum: ['electronics', 'clothing', 'books', 'home', 'sports', 'other'],
    },
    brand: { type: String, trim: true },
    stock: {
      type: Number,
      required: true,
      min: [0, 'Stock cannot be negative'],
      default: 0,
    },
    images: [imageSchema],
    tags: [{ type: String, lowercase: true, trim: true }],
    ratings: {
      average: { type: Number, default: 0, min: 0, max: 5 },
      count: { type: Number, default: 0 },
    },
    isActive: { type: Boolean, default: true },
    metadata: { type: Map, of: String }, // flexible key-value store
  },
  {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
    /* These options tell Mongoose to include virtual fields when converting a document to JSON or plain object.
    toJSON  | res.json(doc) | JSON.stringify(doc)
    toObject | doc.toObject() | spreading { ...doc } */
  }
);

/* Mongoose virtuals are fields that are not saved in the database. They are made from other
 data in the document, like combining first and last name to make a full name.  */

// Virtual: discount percentage
productSchema.virtual('discountPercent').get(function () {
  if (this.discountedPrice && this.price > 0) {
    return Math.round(((this.price - this.discountedPrice) / this.price) * 100);
  }
  return 0;
});

// Pre-save: auto-generate slug
productSchema.pre('save', function (next) {
  /* returns a boolean indicating whether a specific path (or any path in the document) has been changed 
  since it was last fetched or saved. */

  if (this.isModified('name')) {
    this.slug = this.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '');
  }
  next();
});

// Index for fast searches
productSchema.index({ name: 'text', description: 'text', tags: 'text' });
productSchema.index({ category: 1, price: 1 });
// productSchema.index({ slug: 1 });

const Product = mongoose.model('Product', productSchema);
export default Product;
