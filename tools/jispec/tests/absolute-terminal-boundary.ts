import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import path from "node:path";
import {
  ABSOLUTE_TERMINAL_FROZEN_SURFACES,
  ABSOLUTE_TERMINAL_DELETED_SURFACES,
  ABSOLUTE_TERMINAL_RETAINED_SURFACES,
  evaluateAbsoluteTerminalBoundary,
} from "../terminal/absolute-terminal-contract";

interface DoctorReport {
  profile?: string;
  checks?: Array<{ name?: string; status?: string }>;
  ready?: boolean;
}

async function main(): Promise<void> {
  console.log("=== Absolute Terminal Boundary Tests ===\n");

  let passed = 0;
  let failed = 0;

  function record(name: string, fn: () => void): void {
    try {
      fn();
      console.log(`✓ ${name}`);
      passed++;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.log(`✗ ${name}`);
      console.log(`  Error: ${message}`);
      failed++;
    }
  }

  const repoRoot = path.resolve(__dirname, "..", "..", "..");

  record("terminal boundary contract lists retained and deleted surfaces", () => {
    assert.ok(ABSOLUTE_TERMINAL_FROZEN_SURFACES.includes("doctor mainline"));
    assert.ok(ABSOLUTE_TERMINAL_FROZEN_SURFACES.includes("verify"));
    assert.ok(ABSOLUTE_TERMINAL_FROZEN_SURFACES.includes("runtime-extended regression suites"));
    assert.ok(ABSOLUTE_TERMINAL_RETAINED_SURFACES.includes("docs/README.md"));
    assert.ok(ABSOLUTE_TERMINAL_RETAINED_SURFACES.includes("docs/development/collaboration-surface-freeze.md"));
    assert.ok(ABSOLUTE_TERMINAL_DELETED_SURFACES.includes("tools/jispec/cache-manager-old.ts"));
    assert.ok(ABSOLUTE_TERMINAL_DELETED_SURFACES.includes("docs/development/releases/v0.1.0.md"));
    assert.ok(ABSOLUTE_TERMINAL_DELETED_SURFACES.includes("Legacy CLI compatibility surface"));
    assert.ok(ABSOLUTE_TERMINAL_DELETED_SURFACES.includes("doctor v1 alias"));
    assert.ok(ABSOLUTE_TERMINAL_DELETED_SURFACES.includes("validate:repo script"));
  });

  record("repository docs encode the terminal retained-vs-deleted boundary", () => {
    const report = evaluateAbsoluteTerminalBoundary(repoRoot);
    assert.equal(report.ready, true);
    assert.equal(report.issues.length, 0);
    assert.ok(report.details.some((detail) => detail.includes("Absolute terminal checklist document present.")));
    assert.ok(report.details.some((detail) => detail.includes("Doc lifecycle map present.")));
    assert.ok(report.details.some((detail) => detail.includes("CLI help text removed retired aliases.")));
    assert.ok(report.retainedSurfaces.length > report.frozenSurfaces.length);
    assert.ok(report.deletedSurfaces.includes("docs/development/releases/v0.1.0.md"));
    assert.ok(report.deletedSurfaces.includes("validate alias"));
  });

  record("doctor global exposes the terminal boundary as a separate readiness check", () => {
    const cliEntry = path.join(repoRoot, "tools", "jispec", "cli.ts");
    const result = spawnSync(
      process.execPath,
      ["--import", "tsx", cliEntry, "doctor", "global", "--root", repoRoot, "--json"],
      {
        cwd: repoRoot,
        encoding: "utf-8",
      },
    );

    assert.ok([0, 1].includes(result.status ?? -1), `Unexpected doctor global status: ${result.status}`);
    const report = JSON.parse(result.stdout) as DoctorReport;
    assert.equal(report.profile, "global");
    assert.ok(report.checks?.some((check) => check.name === "Absolute Terminal Boundary"));
    assert.equal(report.checks?.length, 9);
  });

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
