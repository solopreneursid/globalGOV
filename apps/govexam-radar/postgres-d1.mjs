// PostgreSQL-backed compatibility layer for the small D1 API surface used by globalGOV.
// Keep application modules portable; this is the only SQL-dialect boundary.
const IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_.]*$/;

function replaceQuestionMarks(sql) {
  let output = "";
  let index = 0;
  let state = "normal";
  let dollarTag = "";

  for (let i = 0; i < sql.length; i += 1) {
    const char = sql[i];
    const next = sql[i + 1];

    if (state === "normal") {
      if (char === "'") {
        state = "single";
        output += char;
      } else if (char === '"') {
        state = "double";
        output += char;
      } else if (char === "-" && next === "-") {
        state = "line-comment";
        output += "--";
        i += 1;
      } else if (char === "/" && next === "*") {
        state = "block-comment";
        output += "/*";
        i += 1;
      } else if (char === "$") {
        const match = /^\$[A-Za-z_][A-Za-z0-9_]*\$|^\$\$/.exec(sql.slice(i));
        if (match) {
          dollarTag = match[0];
          state = "dollar";
          output += dollarTag;
          i += dollarTag.length - 1;
        } else {
          output += char;
        }
      } else if (char === "?") {
        index += 1;
        output += "$" + index;
      } else {
        output += char;
      }
      continue;
    }

    output += char;
    if (state === "single") {
      if (char === "'" && next === "'") {
        output += next;
        i += 1;
      } else if (char === "'") {
        state = "normal";
      } else if (char === "\\" && next !== undefined) {
        output += next;
        i += 1;
      }
    } else if (state === "double") {
      if (char === '"' && next === '"') {
        output += next;
        i += 1;
      } else if (char === '"') {
        state = "normal";
      }
    } else if (state === "line-comment") {
      if (char === "\n") state = "normal";
    } else if (state === "block-comment") {
      if (char === "*" && next === "/") {
        output += next;
        i += 1;
        state = "normal";
      }
    } else if (state === "dollar" && sql.startsWith(dollarTag, i)) {
      // The first character of the closing delimiter was just copied above.
      output += dollarTag.slice(1);
      i += dollarTag.length - 1;
      state = "normal";
      dollarTag = "";
    }
  }

  if (state === "single" || state === "double" || state === "block-comment" || state === "dollar") {
    throw new Error("invalid_sql_lexical_state");
  }
  return { sql: output, parameterCount: index };
}

export function translateD1Sql(input) {
  if (typeof input !== "string" || !input.trim() || input.length > 100_000) {
    throw new Error("invalid_sql_statement");
  }

  let sql = input.trim();
  const ignoreConflicts = /^INSERT\s+OR\s+IGNORE\s+INTO\b/i.test(sql);
  if (ignoreConflicts) {
    sql = sql.replace(/^INSERT\s+OR\s+IGNORE\s+INTO\b/i, "INSERT INTO");
  }

  sql = sql.replace(
    new RegExp("\\b(" + IDENTIFIER.source.slice(1, -1) + ")\\s*=\\s*\\?\\s+COLLATE\\s+NOCASE\\b", "gi"),
    "LOWER($1)=LOWER(?)"
  );

  if (ignoreConflicts && !/\bON\s+CONFLICT\b/i.test(sql)) {
    const semicolon = sql.endsWith(";");
    sql = sql.slice(0, semicolon ? -1 : undefined).trimEnd() + " ON CONFLICT DO NOTHING" + (semicolon ? ";" : "");
  }

  return replaceQuestionMarks(sql);
}

function resultMeta(result) {
  return { changes: Number(result.rowCount || 0) };
}

class PostgresD1Statement {
  constructor(database, sql, values = []) {
    this.database = database;
    const translated = translateD1Sql(sql);
    this.sql = translated.sql;
    this.parameterCount = translated.parameterCount;
    this.values = values;
    if (values.length !== this.parameterCount) {
      throw new Error("sql_parameter_count_mismatch");
    }
  }

  bind(...values) {
    return new PostgresD1Statement(this.database, this.originalSql || this.sql, values);
  }

  async execute(client = this.database.pool) {
    return client.query(this.sql, this.values.map(value => value === undefined ? null : value));
  }

  async first(columnName) {
    const result = await this.execute();
    const row = result.rows[0] ?? null;
    if (columnName === undefined || row === null) return row;
    return row[columnName] ?? null;
  }

  async all() {
    const result = await this.execute();
    return { success: true, results: result.rows, meta: resultMeta(result) };
  }

  async run() {
    const result = await this.execute();
    return { success: true, meta: resultMeta(result) };
  }
}

export class PostgresD1Database {
  constructor(pool) {
    if (!pool || typeof pool.query !== "function" || typeof pool.connect !== "function") {
      throw new Error("postgres_pool_required");
    }
    this.pool = pool;
  }

  prepare(sql) {
    const statement = new PostgresD1Statement(this, sql);
    statement.originalSql = sql;
    return statement;
  }

  async batch(statements) {
    if (!Array.isArray(statements) || statements.some(statement =>
      !(statement instanceof PostgresD1Statement) || statement.database !== this
    )) {
      throw new Error("invalid_database_batch");
    }
    if (statements.length === 0) return [];

    const client = await this.pool.connect();
    const results = [];
    try {
      await client.query("BEGIN");
      for (const statement of statements) {
        const result = await statement.execute(client);
        results.push({ success: true, meta: resultMeta(result) });
      }
      await client.query("COMMIT");
      return results;
    } catch (error) {
      try {
        await client.query("ROLLBACK");
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    await this.pool.end();
  }
}

export function createPostgresD1Database(pool) {
  return new PostgresD1Database(pool);
}

export async function createPostgresPoolFromEnv(env = process.env) {
  const host = env.PGHOST || "127.0.0.1";
  const port = Number(env.PGPORT || 5432);
  const database = env.PGDATABASE || "";
  const user = env.PGUSER || "";
  const password = env.PGPASSWORD || "";
  const max = Number(env.PGPOOL_MAX || 10);

  if (!database || !user || !password || !Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error("postgres_environment_incomplete");
  }

  const { Pool } = await import("pg");
  const pool = new Pool({
    host,
    port,
    database,
    user,
    password,
    max,
    application_name: "globalGOV",
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 30000,
    allowExitOnIdle: false,
    ssl: env.PGSSLMODE === "require" ? { rejectUnauthorized: true } : false
  });
  return pool;
}
