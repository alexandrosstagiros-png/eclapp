"use strict";

// Run against a disposable local PostgreSQL cluster. No .env or server credentials
// are loaded; the test generates its own passwords and bot signing keys.
const { spawnSync } = require("node:child_process");
const path = require("node:path");
const result = spawnSync(process.execPath, [
  "--test",
  path.resolve(__dirname, "../../tests/max-integration.test.cjs"),
], { stdio: "inherit", env: process.env });
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
