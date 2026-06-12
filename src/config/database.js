import mongoose from 'mongoose';

class Database {
  constructor() {
    this.connection = null;
  }

  async connect(uri) {
    if (this.connection) {
      return this.connection;
    }

    try {
      this.connection = await mongoose.connect(uri, {
        maxPoolSize: 10,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
      });

      mongoose.connection.on('connected', () => {
        console.log('✅ MongoDB connected');
      });

      mongoose.connection.on('error', (err) => {
        console.error('❌ MongoDB error:', err);
      });

      mongoose.connection.on('disconnected', () => {
        console.warn('⚠️  MongoDB disconnected');
      });

      return this.connection;
    } catch (error) {
      console.error('❌ MongoDB connection failed:', error.message);
      throw error;
    }
  }

  async disconnect() {
    if (this.connection) {
      await mongoose.disconnect();
      this.connection = null;
    }
  }
}

// Singleton instance — use of class pattern
export default new Database();
