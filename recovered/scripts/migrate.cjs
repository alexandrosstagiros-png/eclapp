const { readdirSync, readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const { Pool } = require("pg");

async function migrate() {
  if (
    !process.env.MIGRATION_DATABASE_URL ||
    !process.env.APP_DB_PASSWORD ||
    process.env.APP_DB_PASSWORD.length < 20
  )
    throw new Error("Migration credentials are required");
  const pool = new Pool({
    connectionString: process.env.MIGRATION_DATABASE_URL,
  });
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(917042001)");
    await client.query(
      "CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())",
    );
    // MAX migration grants its additive table to the runtime role. Create the
    // restricted role before migrations; assign its password after they succeed.
    const runtimeRole = await client.query("SELECT 1 FROM pg_roles WHERE rolname='transport_app'");
    if (!runtimeRole.rowCount)
      await client.query("CREATE ROLE transport_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT");
    for (const file of readdirSync("infra/db/migrations")
      .filter((n) => n.endsWith(".sql"))
      .sort()) {
      const sql = readFileSync(`infra/db/migrations/${file}`, "utf8");
      const checksum = createHash("sha256").update(sql).digest("hex");
      const applied = await client.query(
        "SELECT checksum FROM schema_migrations WHERE name=$1",
        [file],
      );
      if (applied.rowCount) {
        if (applied.rows[0].checksum !== checksum)
          throw new Error(`Changed applied migration: ${file}`);
        console.log(`Unchanged: ${file}`);
        continue;
      }
      await client.query("BEGIN");
      try {
        await client.query(sql);
        await client.query(
          "INSERT INTO schema_migrations(name,checksum) VALUES($1,$2)",
          [file, checksum],
        );
        await client.query("COMMIT");
        console.log(`Applied: ${file}`);
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    }
    await client.query("BEGIN");
    try {
      const exists = await client.query(
        "SELECT 1 FROM pg_roles WHERE rolname='transport_app'",
      );
      if (!exists.rowCount)
        await client.query(
          "CREATE ROLE transport_app LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT",
        );
      const formatted = await client.query(
        "SELECT format('ALTER ROLE transport_app PASSWORD %L', $1::text) AS sql",
        [process.env.APP_DB_PASSWORD],
      );
      await client.query(formatted.rows[0].sql);
      await client.query(`GRANT USAGE ON SCHEMA public TO transport_app;
        GRANT SELECT ON legal_entities,regions,projects,responsibility_scopes,vehicles,trips,trip_assignments,trip_stops TO transport_app;
        REVOKE ALL ON users,access_grants,sessions,channel_identities,invitations,auth_replays FROM transport_app;
        GRANT SELECT,INSERT,UPDATE ON users TO transport_app;
        GRANT SELECT,INSERT,DELETE ON access_grants TO transport_app;
        GRANT UPDATE(inspection_photo_delete,personal_data_visible) ON access_grants TO transport_app;
        REVOKE ALL ON employee_directory,employee_creation_requests FROM transport_app;
        GRANT SELECT,INSERT ON employee_directory,employee_creation_requests TO transport_app;
        GRANT USAGE ON SEQUENCE employee_directory_employee_number_seq TO transport_app;
        GRANT SELECT,INSERT,UPDATE ON sessions,invitations TO transport_app;
        GRANT SELECT,INSERT ON channel_identities,auth_replays TO transport_app;
        GRANT SELECT ON audit_events,audit_head,outbox TO transport_app;
        GRANT EXECUTE ON FUNCTION append_audit(jsonb) TO transport_app;`);
      await client.query(`
        GRANT INSERT ON trips,trip_assignments,trip_stops TO transport_app;
        GRANT UPDATE(version) ON trips TO transport_app;
        GRANT SELECT,INSERT ON workflow_requests,workflow_attendance,workflow_documents,
          workflow_document_reviews,workflow_facts,workflow_fact_reviews TO transport_app;
        GRANT SELECT ON workflow_current_documents,workflow_current_facts TO transport_app;
        GRANT SELECT,INSERT ON finance_tariffs,finance_confirmed_trips,finance_registry_sources TO transport_app;
        GRANT SELECT,INSERT ON pricing_tariffs,pricing_tariff_publications,pricing_calculations,pricing_confirmations,pricing_requests TO transport_app;
        REVOKE ALL ON inspection_templates,inspection_template_items,inspection_photos,inspection_submissions,
          inspection_answers,inspection_answer_photos,inspection_reviews,inspection_requests FROM transport_app;
        GRANT SELECT,INSERT ON inspection_templates,inspection_template_items,inspection_photos,inspection_submissions,
          inspection_answers,inspection_answer_photos,inspection_reviews,inspection_requests TO transport_app;
        GRANT UPDATE(content,deleted_at,deleted_by,deletion_reason,stored_mime_type,stored_byte_size,stored_sha256,compressed_at,compression_status,compression_attempts,compression_next_attempt_at,compression_error,compression_checked_at) ON inspection_photos TO transport_app;
        REVOKE ALL ON driver_payroll_statements FROM transport_app;
        GRANT SELECT ON driver_payroll_statements TO transport_app;
        REVOKE ALL ON payroll_deposit_accounts,payroll_deposit_policies,driver_payroll_settlements,
          payroll_deposit_returns,payroll_deposit_return_payments,payroll_deposit_ledger,payroll_deposit_requests FROM transport_app;
        GRANT SELECT,INSERT ON payroll_deposit_accounts,payroll_deposit_policies,driver_payroll_settlements,
          payroll_deposit_returns,payroll_deposit_return_payments,payroll_deposit_ledger,payroll_deposit_requests TO transport_app;
        GRANT SELECT,INSERT,UPDATE ON finance_registries,finance_registry_rows,integration_jobs TO transport_app;
        REVOKE ALL ON communications_memberships,communications_tickets,communications_actions,
          communications_requests,communications_telegram_links,communications_messages,telegram_inbound_updates,telegram_deliveries FROM transport_app;
        GRANT SELECT,INSERT,UPDATE ON communications_memberships TO transport_app;
        GRANT SELECT,INSERT ON communications_tickets TO transport_app;
        GRANT UPDATE(status,department,assignee_id,version,updated_at) ON communications_tickets TO transport_app;
        GRANT SELECT,INSERT ON communications_actions,communications_requests,communications_telegram_links,
          communications_messages,telegram_inbound_updates,telegram_deliveries TO transport_app;
        GRANT UPDATE(status,attempts,next_attempt_at,telegram_message_id,error_code,sent_at) ON telegram_deliveries TO transport_app;
      `);
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(917042001)");
    client.release();
    await pool.end();
  }
}
if (require.main === module)
  migrate().catch(() => {
    console.error(
      "Migration failed. Check database availability, credentials and migration checksums.",
    );
    process.exitCode = 1;
  });
module.exports = { migrate };
