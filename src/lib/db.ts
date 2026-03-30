import mongoose from 'mongoose';

const MONGO_URI = process.env.MONGO_URI;

/**
 * Global is used here to maintain a cached connection across hot reloads
 * in development. This prevents connections growing exponentially
 * during API Route usage.
 */
interface MongooseCache {
  conn: typeof mongoose | null;
  promise: Promise<typeof mongoose> | null;
}

declare global {
  var mongoose: MongooseCache | undefined;
}

if (!global.mongoose) {
  global.mongoose = { conn: null, promise: null };
}

const cached = global.mongoose;

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!MONGO_URI) {
    throw new Error('Please define the MONGO_URI environment variable inside .env.local');
  }

  if (!cached.promise) {
    const opts = {
      bufferCommands: false,
      maxPoolSize: 10,
      minPoolSize: 5,
      connectTimeoutMS: 10000,
      socketTimeoutMS: 45000,
      serverSelectionTimeoutMS: 5000,
    };

    cached.promise = mongoose.connect(MONGO_URI!, opts).then((mongoose) => {
      // Fix build-time DB check and ModuleRegistry warnings
      // This is a workaround for Next.js build process which might try to access
      // mongoose.connection.db.getCollection during build, leading to warnings.
      // By providing a mock, we prevent these warnings.
      if (!mongoose.connection.db) {
        Object.defineProperty(mongoose.connection, 'db', {
          get: () => ({
            getCollection: (_name: string) => {
              return null;
            },
          }),
        });
      }
      return mongoose;
    });
  }

  try {
    cached.conn = await cached.promise;
  } catch (e: unknown) {
    cached.promise = null;
    throw e;
  }

  return cached.conn;
}

export default connectDB;
