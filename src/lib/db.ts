import mongoose from 'mongoose';
import { createLogger } from '@/lib/logger';

const MONGO_URI = process.env.MONGO_URI;
const AI_RUNNER_BACKGROUND_PROCESS_KINDS = new Set(['worker', 'supervisor']);

const log = createLogger('db');

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

function getMongoOptions() {
  const processKind = process.env.AI_RUNNER_PROCESS_KIND;
  const isAIRunnerBackgroundProcess =
    typeof processKind === 'string' && AI_RUNNER_BACKGROUND_PROCESS_KINDS.has(processKind);

  return {
    bufferCommands: false,
    maxPoolSize: isAIRunnerBackgroundProcess ? 2 : 10,
    minPoolSize: isAIRunnerBackgroundProcess ? 0 : 5,
    connectTimeoutMS: 10000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 5000,
  };
}

/**
 * One-time (per boot) purge of legacy FleetLogEvent documents that predate the
 * retention default: TTL only expires docs with `retentionUntil` set, so older
 * writes (e.g. heartbeat metrics samples) accumulated forever. Runs in the
 * background so startup is never blocked by the collection scan.
 */
async function purgeLegacyFleetLogEvents(): Promise<void> {
  try {
    const [{ default: FleetLogEvent }, { getFleetLogRetentionDays, retentionUntilFromDays }] =
      await Promise.all([import('@/models/FleetLogEvent'), import('@/lib/fleet/logRetention')]);
    const retentionDays = getFleetLogRetentionDays();
    const cutoff = retentionUntilFromDays(-retentionDays);
    const result = await FleetLogEvent.deleteMany({
      retentionUntil: { $exists: false },
      createdAt: { $lt: cutoff },
    });
    if (result.deletedCount && result.deletedCount > 0) {
      log.info(
        `Fleet log retention backfill: purged ${result.deletedCount} legacy events older than ${retentionDays} days`
      );
    }
  } catch (err) {
    log.warn('Fleet log retention backfill failed', err);
  }
}

async function connectDB() {
  if (cached.conn) {
    return cached.conn;
  }

  if (!MONGO_URI) {
    throw new Error('Please define the MONGO_URI environment variable inside .env.local');
  }

  if (!cached.promise) {
    const opts = getMongoOptions();

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
    cached.promise
      .then(() => void purgeLegacyFleetLogEvents())
      .catch(() => {
        // connectDB already surfaced the connection failure; no backfill needed.
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
export { getMongoOptions };
