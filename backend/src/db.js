// Storage for the kerNEl API.
// Uses a SQLite-backed Durable Object ("KernelDB"), which needs no separate database setup or permission:
// the tables in schema.sql are created automatically the first time it runs.
// If a D1 database is bound as env.DB instead, that is used as-is. Both speak the same SQL.
import { DurableObject } from 'cloudflare:workers';
import SCHEMA from '../schema.sql';

const statements = (sql) => sql
  .split('\n').map((line) => line.replace(/--.*$/, '')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);

export class KernelDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      for (const stmt of statements(SCHEMA)) ctx.storage.sql.exec(stmt);
    });
  }

  /** Run one or more queries. Several run together in one transaction (like D1's batch). */
  query(list) {
    const runAll = () => list.map(({ sql, params, mode }) => {
      const cursor = this.ctx.storage.sql.exec(sql, ...params);
      const rows = cursor.toArray();
      if (mode === 'first') return rows[0] ?? null;
      return { results: rows, success: true, meta: { changes: cursor.rowsWritten } };
    });
    const go = () => (list.length > 1 ? this.ctx.storage.transactionSync(runAll) : runAll());
    try {
      return go();
    } catch (e) {
      // New tables added by an update while this object was still running: create them, then retry once.
      if (!/no such table/i.test(String(e?.message))) throw e;
      for (const stmt of statements(SCHEMA)) this.ctx.storage.sql.exec(stmt);
      return go();
    }
  }
}

class Statement {
  constructor(db, sql, params = []) { this.db = db; this.sql = sql; this.params = params; }
  bind(...params) { return new Statement(this.db, this.sql, params); }
  toQuery(mode) { return { sql: this.sql, params: this.params, mode }; }
  async first() { return (await this.db.stub.query([this.toQuery('first')]))[0]; }
  async all() { return (await this.db.stub.query([this.toQuery('all')]))[0]; }
  async run() { return (await this.db.stub.query([this.toQuery('run')]))[0]; }
}

/** A D1-compatible object (prepare/bind/first/all/run/batch) backed by the KernelDB Durable Object. */
export function getDB(env) {
  if (env.DB) return env.DB;
  const db = { stub: env.KERNEL_DB.get(env.KERNEL_DB.idFromName('main')) };
  db.prepare = (sql) => new Statement(db, sql);
  db.batch = (stmts) => (stmts.length ? db.stub.query(stmts.map((s) => s.toQuery('run'))) : Promise.resolve([]));
  return db;
}
