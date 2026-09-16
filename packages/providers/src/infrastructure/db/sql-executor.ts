export type SqlPrimitive = string | number | boolean | Date | null;
export type SqlRow = Record<string, unknown>;

export interface SqlExecutor {
  query<T extends SqlRow = SqlRow>(sql: string, params?: readonly SqlPrimitive[]): Promise<T[]>;
  transaction?<T>(work: (tx: SqlExecutor) => Promise<T>): Promise<T>;
}
