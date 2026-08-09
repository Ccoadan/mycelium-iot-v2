import { MongoClient, type Db } from 'mongodb';

export interface MongoConnectionOptions {
  uri: string;
  databaseName: string;
  serverSelectionTimeoutMs: number;
}

export interface DatabaseHealth {
  available: boolean;
  latencyMs: number;
}

export class MongoConnection {
  private client: MongoClient | undefined;
  private database: Db | undefined;

  public constructor(private readonly options: MongoConnectionOptions) {}

  public get databaseName(): string {
    return this.options.databaseName;
  }

  public async getDatabase(): Promise<Db> {
    if (this.database) {
      return this.database;
    }

    const client = new MongoClient(this.options.uri, {
      serverSelectionTimeoutMS: this.options.serverSelectionTimeoutMs,
    });

    try {
      await client.connect();
      const database = client.db(this.options.databaseName);
      await database.command({ ping: 1 });
      this.client = client;
      this.database = database;
      return database;
    } catch (error) {
      await client.close().catch(() => undefined);
      throw error;
    }
  }

  public async checkHealth(): Promise<DatabaseHealth> {
    const startedAt = performance.now();

    try {
      const database = await this.getDatabase();
      await database.command({ ping: 1 });
      return { available: true, latencyMs: Math.round(performance.now() - startedAt) };
    } catch {
      return { available: false, latencyMs: Math.round(performance.now() - startedAt) };
    }
  }

  public async close(): Promise<void> {
    await this.client?.close();
    this.client = undefined;
    this.database = undefined;
  }
}
