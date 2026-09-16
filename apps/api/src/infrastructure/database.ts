import { PostgresSqlExecutor } from './postgres-executor';

interface GlobalDatabaseState {
  fullmediaDb?: PostgresSqlExecutor;
}

const globalState = globalThis as typeof globalThis & GlobalDatabaseState;

export function getDatabase(): PostgresSqlExecutor {
  if (globalState.fullmediaDb) return globalState.fullmediaDb;

  const connectionString = process.env.DATABASE_URL?.trim();
  if (!connectionString) {
    throw new Error('DATABASE_URL is required for FULLMEDIA API');
  }

  const maxConnections = positiveInteger(process.env.FULLMEDIA_DB_POOL_MAX, 5);
  globalState.fullmediaDb = PostgresSqlExecutor.fromOptions({
    connectionString,
    maxConnections,
    idleTimeoutMs: 10_000,
    connectionTimeoutMs: 5_000,
  });
  return globalState.fullmediaDb;
}

function positiveInteger(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
