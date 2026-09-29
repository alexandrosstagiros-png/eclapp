const { Pool } = require("pg");
const { randomUUID } = require("node:crypto");
const ids = {
  legal: "20000000-0000-4000-8000-000000000001",
  region: "30000000-0000-4000-8000-000000000001",
  project: "40000000-0000-4000-8000-000000000001",
  scope: "50000000-0000-4000-8000-000000000001",
  drivers: [
    "10000000-0000-4000-8000-000000000001",
    "10000000-0000-4000-8000-000000000002",
  ],
  specialist: "10000000-0000-4000-8000-000000000003",
  dispatcher: "10000000-0000-4000-8000-000000000004",
  admin: "10000000-0000-4000-8000-000000000005",
  mechanic: "10000000-0000-4000-8000-000000000006",
  trips: [
    "70000000-0000-4000-8000-000000000001",
    "70000000-0000-4000-8000-000000000002",
  ],
};
async function seed() {
  if (!["development", "test"].includes(process.env.NODE_ENV))
    throw new Error("Seed is development/test only");
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(917042002)");
    await client.query(
      "INSERT INTO legal_entities(id,name) VALUES($1,$2) ON CONFLICT DO NOTHING",
      [ids.legal, "Демо Транспорт"],
    );
    await client.query(
      "INSERT INTO regions VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [ids.region, "Москва", "Europe/Moscow"],
    );
    await client.query(
      "INSERT INTO projects VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",
      [ids.project, "Городская доставка · пилот", ids.legal, ids.region],
    );
    await client.query(
      "INSERT INTO responsibility_scopes VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
      [ids.scope, ids.project, "Дневная группа"],
    );
    const users = [
      [ids.drivers[0], "Водитель 01", "driver"],
      [ids.drivers[1], "Водитель 02", "driver"],
      [ids.specialist, "Документовед", "document_specialist"],
      [ids.dispatcher, "Диспетчер", "dispatcher"],
      [ids.admin, "Администратор доступа", "access_admin"],
      [ids.mechanic, "Механик", "mechanic"],
    ];
    for (const [id, name, role] of users) {
      const inserted = await client.query(
        "INSERT INTO users(id,display_name,role,approved) VALUES($1,$2,$3,true) ON CONFLICT DO NOTHING RETURNING id",
        [id, name, role],
      );
      await client.query(`INSERT INTO employee_directory(user_id,source_kind)
        SELECT id,'demo_seed' FROM users WHERE id=$1 AND display_name=$2 AND role=$3
        ON CONFLICT(user_id) DO NOTHING`,[id,name,role]);
      // Re-running seed never reactivates users or restores revoked/edited grants.
      if (inserted.rowCount) {
        await client.query(
          "INSERT INTO access_grants(user_id,legal_entity_id,region_id,project_id,responsibility_scope_id,personal_data_visible) VALUES($1,$2,$3,$4,$5,$6)",
          [id, ids.legal, ids.region, ids.project, ids.scope, role === "mechanic"],
        );
        await client.query("SELECT append_audit($1::jsonb)", [
          JSON.stringify({
            schemaVersion: 1,
            action: "access.demo_user_provisioned",
            entityType: "user",
            entityId: id,
            channel: "system",
            correlationId: randomUUID(),
            scope: {
              legalEntityId: ids.legal,
              regionId: ids.region,
              projectId: ids.project,
              responsibilityScopeId: ids.scope,
            },
            metadata: { role, synthetic: true, personalDataVisible: role === "mechanic", financeVisible: false },
          }),
        ]);
      }
    }
    for (let i = 0; i < 2; i++) {
      const vehicle = `60000000-0000-4000-8000-00000000000${i + 1}`;
      await client.query(
        "INSERT INTO vehicles VALUES($1,$2,$3,1500,$4) ON CONFLICT DO NOTHING",
        [
          vehicle,
          `Демо-фургон 0${i + 1}`,
          i === 0 ? "refrigerated" : "box",
          i === 0 ? "own" : "subcontracted",
        ],
      );
      const added = await client.query(
        `INSERT INTO trips(id,reference,business_date,project_id,region_id,legal_entity_id,responsibility_scope_id,vehicle_id,route_summary)
        VALUES($1,$2,(now() AT TIME ZONE 'Europe/Moscow')::date,$3,$4,$5,$6,$7,$8) ON CONFLICT DO NOTHING RETURNING id`,
        [
          ids.trips[i],
          `DEMO-00${i + 1}`,
          ids.project,
          ids.region,
          ids.legal,
          ids.scope,
          vehicle,
          i === 0
            ? "Демо-склад → Точка Север → Точка Центр"
            : "Демо-склад → Точка Восток",
        ],
      );
      if (added.rowCount) {
        await client.query("INSERT INTO trip_assignments VALUES($1,$2,true)", [
          ids.trips[i],
          ids.drivers[i],
        ]);
        for (const [sequence, label] of [
          [1, "Демо-склад"],
          [2, i === 0 ? "Точка Север" : "Точка Восток"],
          ...(i === 0 ? [[3, "Точка Центр"]] : []),
        ])
          await client.query("INSERT INTO trip_stops VALUES($1,$2,$3,NULL)", [
            ids.trips[i],
            sequence,
            label,
          ]);
      }
    }
    await client.query("COMMIT");
    console.log(
      "Synthetic pilot seed applied; existing access and assignments preserved.",
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}
if (require.main === module)
  seed().catch(() => {
    console.error("Seed failed. Use a migrated development/test database.");
    process.exitCode = 1;
  });
module.exports = { seed, ids };
