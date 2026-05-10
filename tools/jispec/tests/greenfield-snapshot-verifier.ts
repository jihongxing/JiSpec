import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import * as yaml from "js-yaml";
import { buildGreenfieldSourceDocumentsManifest, loadGreenfieldSourceDocuments } from "../greenfield/source-documents";
import {
  renderGreenfieldSourceSnapshotVerificationText,
  verifyGreenfieldSourceSnapshot,
  verifyGreenfieldSourceSnapshotFile,
} from "../greenfield/snapshot-verifier";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Snapshot Verifier Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-snapshot-verifier-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(root, "docs", "input", "requirements.md");
    const technicalSolutionPath = path.join(root, "docs", "input", "technical-solution.md");
    fs.mkdirSync(path.dirname(requirementsPath), { recursive: true });
    fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildTechnicalSolution(), "utf-8");

    const inputContract = loadGreenfieldSourceDocuments({
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const manifest = buildGreenfieldSourceDocumentsManifest(inputContract, {
      root,
      requirementsPath,
      technicalSolutionPath,
      snapshotStatus: "proposed",
      generatedAt: "2026-05-10T00:00:00.000Z",
    });
    const snapshotPath = path.join(root, ".spec", "greenfield", "source-documents.active.yaml");
    fs.mkdirSync(path.dirname(snapshotPath), { recursive: true });
    fs.writeFileSync(snapshotPath, renderManifest(manifest), "utf-8");

    results.push(record("verifier accepts a self-consistent snapshot manifest", () => {
      const result = verifyGreenfieldSourceSnapshot(manifest);

      assert.equal(result.valid, true);
      assert.equal(result.status, "valid");
      assert.equal(result.issues.length, 0);
      assert.equal(result.truth_fingerprint, manifest.truth_fingerprint);
      assert.equal(result.truth_fingerprint_context?.engine_version, "greenfield-source-documents@1");
      assert.equal(renderGreenfieldSourceSnapshotVerificationText(result).includes("Status: valid"), true);
    }));

    results.push(record("verifier rejects an expected fingerprint mismatch", () => {
      const result = verifyGreenfieldSourceSnapshot(manifest, {
        expectedTruthFingerprint: "deadbeef",
      });

      assert.equal(result.valid, false);
      assert.ok(result.issues.some((issue) => issue.code === "GREENFIELD_SNAPSHOT_EXPECTED_FINGERPRINT_MISMATCH"));
      assert.ok(result.issues.some((issue) => issue.code === "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH") === false);
    }));

    results.push(record("verifier rejects canonicalization schema/version drift", () => {
      const mutated = deepClone(manifest) as Record<string, any>;
      mutated.truth_fingerprint_context.canonicalization_schema_version = 2;

      const result = verifyGreenfieldSourceSnapshot(mutated);

      assert.equal(result.valid, false);
      assert.ok(result.issues.some((issue) => issue.code === "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH"));
      assert.equal(result.truth_fingerprint_context?.canonicalization_schema_version, 1);
    }));

    results.push(record("verifier file helper and CLI return valid results for the written snapshot file", () => {
      const fileResult = verifyGreenfieldSourceSnapshotFile(snapshotPath);

      assert.equal(fileResult.valid, true);
      assert.equal(fileResult.snapshot_path?.endsWith("/.spec/greenfield/source-documents.active.yaml"), true);

      const repoRoot = path.resolve(__dirname, "..", "..", "..");
      const cli = spawnSync(
        process.execPath,
        [
          "--import",
          "tsx",
          path.join(repoRoot, "tools", "jispec", "cli.ts"),
          "source",
          "verify",
          "--root",
          root,
          "--snapshot",
          ".spec/greenfield/source-documents.active.yaml",
          "--json",
        ],
        {
          cwd: repoRoot,
          encoding: "utf-8",
        },
      );

      assert.equal(cli.status, 0);
      const payload = JSON.parse(cli.stdout) as { valid?: boolean; status?: string; snapshot_path?: string };
      assert.equal(payload.valid, true);
      assert.equal(payload.status, "valid");
      assert.equal(payload.snapshot_path?.endsWith("/.spec/greenfield/source-documents.active.yaml"), true);
    }));
  } catch (error) {
    results.push({
      name: "greenfield snapshot verifier execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  printResults(results);
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      if (result.error) {
        console.log(`  Error: ${result.error}`);
      }
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function renderManifest(manifest: Record<string, unknown>): string {
  return yaml.dump(manifest, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function buildRequirements(): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a cart.",
    "",
    "## Functional Requirements",
    "",
    "### REQ-ORD-001",
    "",
    "A shopper must submit an order.",
    "",
    "### REQ-ORD-002",
    "",
    "Checkout must reject unavailable items.",
    "",
    "## Non-Functional Requirements",
    "",
    "- Checkout should be responsive.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Order created.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    "Use bounded contexts.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- ordering",
    "",
    "## Integration Boundaries",
    "",
    "No direct writes across boundaries.",
    "",
    "## Data Ownership",
    "",
    "Ordering owns orders.",
    "",
    "## Testing Strategy",
    "",
    "Use unit and contract tests.",
    "",
    "## Operational Constraints",
    "",
    "Keep synchronous checkout responsive.",
    "",
    "## Risks And Open Decisions",
    "",
    "Payment provider is open.",
  ].join("\n");
}

void main();
