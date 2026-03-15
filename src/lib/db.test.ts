import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  process.env.MONGO_URI = 'mongodb://localhost:27017/test';
});

import mongoose from 'mongoose';
import connectDB from './db';

// Mock mongoose
vi.mock('mongoose', () => ({
  default: {
    connect: vi.fn(),
    connection: {
      db: null,
    },
  },
}));

describe('connectDB', () => {
  const MONGO_URI = 'mongodb://localhost:27017/test';

  beforeEach(() => {
    vi.clearAllMocks();
    process.env.MONGO_URI = MONGO_URI;

    // Clear the cached connection in the global object for testing
    if (global.mongoose) {
      global.mongoose.conn = null;
      global.mongoose.promise = null;
    }
  });

  it('should throw an error if MONGO_URI is not defined', async () => {
    vi.resetModules();
    const originalUri = process.env.MONGO_URI;
    delete process.env.MONGO_URI;
    const { default: connect } = await import('./db');
    await expect(connect()).rejects.toThrow(
      'Please define the MONGO_URI environment variable inside .env.local'
    );
    process.env.MONGO_URI = originalUri;
  });

  it('should successfully connect to MongoDB', async () => {
    const mockMongoose = {
      connection: {
        db: {
          getCollection: vi.fn(),
        },
      },
    };
    vi.mocked(mongoose.connect).mockResolvedValue(mockMongoose as unknown as typeof mongoose);

    const result = await connectDB();
    expect(mongoose.connect).toHaveBeenCalledWith(MONGO_URI, { bufferCommands: false });
    expect(result).toBe(mockMongoose);
  });

  it('should return cached connection if already connected', async () => {
    const mockMongoose = { connection: { db: {} } };
    vi.mocked(mongoose.connect).mockResolvedValue(mockMongoose as unknown as typeof mongoose);

    // First call
    await connectDB();
    // Second call
    const result = await connectDB();

    expect(mongoose.connect).toHaveBeenCalledTimes(1);
    expect(result).toBe(mockMongoose);
  });

  it('should handle connection errors and reset the promise', async () => {
    const error = new Error('Connection failed');
    vi.mocked(mongoose.connect).mockRejectedValueOnce(error);

    await expect(connectDB()).rejects.toThrow('Connection failed');

    // Check if promise was reset
    expect(global.mongoose?.promise).toBeNull();
  });

  it('should define a mock db if mongoose.connection.db is missing', async () => {
    const mockMongoose = {
      connection: {},
    };
    vi.mocked(mongoose.connect).mockResolvedValue(mockMongoose as unknown as typeof mongoose);

    const result = (await connectDB()) as unknown as {
      connection: { db: { getCollection: (name: string) => unknown } };
    };
    expect(result.connection.db).toBeDefined();
    expect(result.connection.db.getCollection('test')).toBeNull();
  });
});
