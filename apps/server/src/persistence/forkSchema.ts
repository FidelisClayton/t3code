import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

// Names the fork once recorded in effect_sql_migrations under ids that upstream later took.
const FORK_MIGRATION_NAMES = ["ThreadCreatedShellIndex"];

const tableExists = Effect.fn("forkSchema.tableExists")(function* (table: string) {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ${table}`;
  return rows.length > 0;
});

export const releaseForkMigrationRows = Effect.fn("forkSchema.releaseForkMigrationRows")(
  function* () {
    if (!(yield* tableExists("effect_sql_migrations"))) return;
    const sql = yield* SqlClient.SqlClient;
    // A fork row at an upstream id makes the Migrator skip or collide with upstream's migration.
    const rows = yield* sql`
      SELECT migration_id FROM effect_sql_migrations WHERE name IN ${sql.in(FORK_MIGRATION_NAMES)}
    `;
    if (rows.length === 0) return;
    yield* sql`DELETE FROM effect_sql_migrations WHERE name IN ${sql.in(FORK_MIGRATION_NAMES)}`;
  },
);

export const ensureForkIndexes = Effect.fn("forkSchema.ensureForkIndexes")(function* () {
  if (!(yield* tableExists("orchestration_v2_projection_turn_items"))) return;
  const sql = yield* SqlClient.SqlClient;
  const indexes = yield* sql`
    SELECT name FROM sqlite_master
    WHERE type = 'index' AND name = 'orchestration_v2_projection_turn_items_created_idx'
  `;
  if (indexes.length > 0) return;
  yield* sql`
    CREATE INDEX IF NOT EXISTS orchestration_v2_projection_turn_items_created_idx
    ON orchestration_v2_projection_turn_items(thread_id)
    WHERE type = 'thread_created'
  `;
});
