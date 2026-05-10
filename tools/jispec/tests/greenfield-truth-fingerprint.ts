import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { loadGreenfieldSourceDocuments, buildGreenfieldSourceDocumentsManifest } from "../greenfield/source-documents";
import {
  computeGreenfieldSourceTruthFingerprint,
  GREENFIELD_SOURCE_CANONICALIZATION_VERSION,
} from "../greenfield/truth-fingerprint";

interface GreenfieldSourceManifestLike {
  snapshot?: { id?: string; status?: string; generated_at?: string };
  semantic_snapshot?: Parameters<typeof computeGreenfieldSourceTruthFingerprint>[0]["semantic_snapshot"];
  replay_seed?: Parameters<typeof computeGreenfieldSourceTruthFingerprint>[0]["replay_seed"];
  truth_fingerprint?: string;
  truth_fingerprint_context?: {
    version?: number;
    canonicalization_version?: string;
    canonicalization_schema_version?: number;
    engine_version?: string;
    ordering_key?: string;
  };
}

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Greenfield Truth Fingerprint Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-truth-fingerprint-"));
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

    results.push(record("same semantic snapshot and same replay seed yield the same truth fingerprint", () => {
      const first = buildGreenfieldSourceDocumentsManifest(inputContract, {
        root,
        requirementsPath,
        technicalSolutionPath,
        snapshotStatus: "proposed",
        generatedAt: "2026-05-10T00:00:00.000Z",
      }) as GreenfieldSourceManifestLike;
      const second = buildGreenfieldSourceDocumentsManifest(inputContract, {
        root,
        requirementsPath,
        technicalSolutionPath,
        snapshotStatus: "active",
        generatedAt: "2026-05-10T00:00:00.000Z",
      }) as GreenfieldSourceManifestLike;

      assert.equal(first.truth_fingerprint, second.truth_fingerprint);
      assert.equal(first.snapshot?.id, second.snapshot?.id);
      assert.equal(first.truth_fingerprint, first.snapshot?.id);
      assert.equal(first.truth_fingerprint_context?.canonicalization_version, GREENFIELD_SOURCE_CANONICALIZATION_VERSION);
    }));

    results.push(record("changing replay seed changes the truth fingerprint", () => {
      const first = buildGreenfieldSourceDocumentsManifest(inputContract, {
        root,
        requirementsPath,
        technicalSolutionPath,
        snapshotStatus: "proposed",
        generatedAt: "2026-05-10T00:00:00.000Z",
      }) as GreenfieldSourceManifestLike;
      const second = buildGreenfieldSourceDocumentsManifest(inputContract, {
        root,
        requirementsPath,
        technicalSolutionPath,
        snapshotStatus: "proposed",
        generatedAt: "2026-05-10T00:00:01.000Z",
      }) as GreenfieldSourceManifestLike;

      assert.notEqual(first.truth_fingerprint, second.truth_fingerprint);
      assert.notEqual(first.snapshot?.id, second.snapshot?.id);
    }));

    results.push(record("manifest round-trip preserves fingerprint metadata and recomputes identically", () => {
      const manifest = buildGreenfieldSourceDocumentsManifest(inputContract, {
        root,
        requirementsPath,
        technicalSolutionPath,
        snapshotStatus: "active",
        generatedAt: "2026-05-10T00:00:00.000Z",
      }) as GreenfieldSourceManifestLike;
      const roundTripped = yaml.load(yaml.dump(manifest, {
        lineWidth: 100,
        noRefs: true,
        sortKeys: false,
      })) as GreenfieldSourceManifestLike;

      const recomputed = computeGreenfieldSourceTruthFingerprint({
        semantic_snapshot: roundTripped.semantic_snapshot!,
        replay_seed: roundTripped.replay_seed!,
      });

      assert.equal(roundTripped.truth_fingerprint, recomputed.truth_fingerprint);
      assert.equal(roundTripped.truth_fingerprint_context?.version, 1);
      assert.equal(roundTripped.truth_fingerprint_context?.canonicalization_version, GREENFIELD_SOURCE_CANONICALIZATION_VERSION);
      assert.equal(roundTripped.snapshot?.id, recomputed.truth_fingerprint);
      assert.equal(roundTripped.truth_fingerprint_context?.engine_version, "greenfield-source-documents@1");
    }));
  } catch (error) {
    results.push({
      name: "greenfield truth fingerprint execution",
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
