import { assert, describe, it } from "@effect/vitest";
import * as NodeSqliteClient from "@t3tools/shared/nodeSqliteClient";
import * as Effect from "effect/Effect";
import * as SqlClient from "effect/sql/SqlClient";

import { migrationManifest, runMigrations } from "./Migrations.ts";

const history = Effect.gen(function* () {
  const sql = yield* SqlClient.SqlClient;
  const rows = yield* sql<{ readonly migration_id: number; readonly name: string }>`
    SELECT migration_id, name FROM effect_sql_migrations ORDER BY migration_id
  `;
  return rows.map((row) => [row.migration_id, row.name] as const);
});

describe("runMigrations", () => {
  const shellIndexNames = Effect.gen(function* () {
    const sql = yield* SqlClient.SqlClient;
    const rows = yield* sql<{ readonly name: string }>`
      SELECT name FROM sqlite_master
      WHERE type = 'index' AND name = 'orchestration_v2_projection_turn_items_created_idx'
    `;
    return rows.map((row) => row.name);
  });

  it.effect("creates the shell index outside the migration ledger", () =>
    Effect.gen(function* () {
      yield* runMigrations();

      assert.deepStrictEqual(yield* history, migrationManifest);
      assert.deepStrictEqual(yield* shellIndexNames, [
        "orchestration_v2_projection_turn_items_created_idx",
      ]);
      assert.deepStrictEqual(yield* runMigrations(), []);
    }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );

  it.effect.each([81, 99, 111, 112])(
    "upgrades a fork database that recorded the shell index as migration %i",
    (oldId) =>
      Effect.gen(function* () {
        const sql = yield* SqlClient.SqlClient;
        yield* runMigrations({ toMigrationInclusive: oldId - 1 });
        yield* sql`
          INSERT INTO effect_sql_migrations (migration_id, name)
          VALUES (${oldId}, 'ThreadCreatedShellIndex')
        `;

        assert.deepStrictEqual(
          yield* runMigrations(),
          migrationManifest.filter(([id]) => id >= oldId),
        );
        assert.deepStrictEqual(yield* history, migrationManifest);
        assert.deepStrictEqual(yield* shellIndexNames, [
          "orchestration_v2_projection_turn_items_created_idx",
        ]);
      }).pipe(Effect.provide(NodeSqliteClient.layer({ filename: ":memory:" }))),
  );
});
