import { Pool, type PoolClient, type PoolConfig, type QueryResultRow } from 'pg';
import type { SqlExecutor, SqlPrimitive, SqlRow } from '@fullmedia/providers';

export interface PostgresExecutorOptions {
  connectionString: string;
  maxConnections?: number;
  idleTimeoutMs?: number;
  connectionTimeoutMs?: number;
}

export class PostgresSqlExecutor implements SqlExecutor {
  constructor(private readonly pool: Pool) {}

  static fromOptions(options: PostgresExecutorOptions): PostgresSqlExecutor {
    const config: PoolConfig = {
      connectionString: options.connectionString,
      max: options.maxConnections ?? 5,
      idleTimeoutMillis: options.idleTimeoutMs ?? 10_000,
      connectionTimeoutMillis: options.connectionTimeoutMs ?? 5_000,
    };
    return new PostgresSqlExecutor(new Pool(config));
  }

  async query<T extends SqlRow = SqlRow>(sql: string, params: readonly SqlPrimitive[] = []): Promise<T[]> {
    const result = await this.pool.query<QueryResultRow>(sql, [...params]);
    return result.rows as T[];
  }

  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    const client = await this.pool.connect();
    try {
      await client.query('begin');
      const result = await work(new PostgresClientExecutor(client));
      await client.query('commit');
      return result;
    } catch (error) {
      await client.query('rollback');
      throw error;
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

class PostgresClientExecutor implements SqlExecutor {
  constructor(private readonly client: PoolClient) {}

  async query<T extends SqlRow = SqlRow>(sql: string, params: readonly SqlPrimitive[] = []): Promise<T[]> {
    const result = await this.client.query<QueryResultRow>(sql, [...params]);
    return result.rows as T[];
  }

  async transaction<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T> {
    return work(this);
  }
}
