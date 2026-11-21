// Storage for the kerNEl API.
// Uses a SQLite-backed Durable Object ("KernelDB"), which needs no separate database setup or permission:
// the tables in schema.sql are created automatically the first time it runs.
// If a D1 database is bound as env.DB instead, that is used as-is. Both speak the same SQL.
import { DurableObject } from 'cloudflare:workers';
import SCHEMA from '../schema.sql';

const statements = (sql) => sql
  .split('\n').map((line) => line.replace(/--.*$/, '')).join('\n')
  .split(';').map((s) => s.trim()).filter(Boolean);

// Columns added after the first launch. Each runs once; "duplicate column" errors mean it already ran.
const MIGRATIONS = [
  'ALTER TABLE notify_prefs ADD COLUMN friends INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE notify_prefs ADD COLUMN dms INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE users ADD COLUMN pending_xp INTEGER NOT NULL DEFAULT 0',
  "ALTER TABLE users ADD COLUMN stats TEXT NOT NULL DEFAULT '{}'",
  'ALTER TABLE users ADD COLUMN banned_until INTEGER',
  'ALTER TABLE users ADD COLUMN invited_by TEXT',
  'ALTER TABLE dm_reports ADD COLUMN evidence TEXT',
  'ALTER TABLE users ADD COLUMN season TEXT',
  'ALTER TABLE users ADD COLUMN season_xp INTEGER NOT NULL DEFAULT 0',
  'ALTER TABLE notify_prefs ADD COLUMN games INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE dm_messages ADD COLUMN duel INTEGER',
  'ALTER TABLE dm_messages ADD COLUMN voice TEXT',
  'ALTER TABLE dm_messages ADD COLUMN pop TEXT',
  'ALTER TABLE notify_prefs ADD COLUMN topics INTEGER NOT NULL DEFAULT 1',
  'ALTER TABLE notify_prefs ADD COLUMN drop_hour INTEGER',
  'ALTER TABLE notify_prefs ADD COLUMN last_drop_day TEXT',
  'ALTER TABLE dm_messages ADD COLUMN trade INTEGER',
];

export class KernelDB extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => this.setup());
  }

  setup() {
    for (const stmt of statements(SCHEMA)) this.ctx.storage.sql.exec(stmt);
    for (const stmt of MIGRATIONS) {
      try { this.ctx.storage.sql.exec(stmt); } catch (e) { if (!/duplicate column/i.test(String(e?.message))) throw e; }
    }
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
      if (!/no such (table|column)|has no column/i.test(String(e?.message))) throw e;
      this.setup();
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
