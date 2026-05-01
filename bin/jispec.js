#!/usr/bin/env node

const { spawnSync } = require("node:child_process");
const path = require("node:path");

const cliEntry = path.resolve(__dirname, "..", "tools", "jispec", "cli.ts");
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", cliEntry, ...process.argv.slice(2)],
  {
    cwd: process.cwd(),
    env: process.env,
    stdio: "inherit",
  },
);

if (result.error) {
  console.error(`Failed to launch JiSpec CLI: ${result.error.message}`);
  process.exit(1);
}

if (result.signal) {
  console.error(`JiSpec CLI terminated by signal ${result.signal}`);
  process.exit(1);
}

process.exit(typeof result.status === "number" ? result.status : 1);
