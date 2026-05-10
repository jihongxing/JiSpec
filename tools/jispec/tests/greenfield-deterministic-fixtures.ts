import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { buildGreenfieldSourceDocumentsManifest, loadGreenfieldSourceDocuments, renderGreenfieldSourceDocumentsManifest, type GreenfieldSourceSnapshotLayerModel } from "../greenfield/source-documents";
import { computeGreenfieldSourceTruthFingerprint } from "../greenfield/truth-fingerprint";
import { verifyGreenfieldSourceSnapshotFile } from "../greenfield/snapshot-verifier";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

interface ManifestLike {
  snapshot?: { id?: string; status?: string; generated_at?: string };
  semantic_snapshot?: {
    version?: number;
    input_contract?: {
      supported_modes?: string[];
    };
  };
  replay_seed?: {
    version?: number;
    generated_at?: string;
    engine_version?: string;
    ordering_key?: string;
  };
  truth_fingerprint?: string;
  truth_fingerprint_context?: {
    version?: number;
    canonicalization_version?: string;
    canonicalization_schema_version?: number;
    engine_version?: string;
    ordering_key?: string;
  };
}

function main(): void {
  console.log("=== Greenfield Deterministic Fixture Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-deterministic-fixtures-"));
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

    results.push(record("same fixture inputs render identical bytes and fingerprint", () => {
      const first = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z");
      const second = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z");

      assert.equal(renderManifest(first), renderManifest(second));
      assert.equal(first.truth_fingerprint, second.truth_fingerprint);
      assert.equal(first.snapshot?.id, second.snapshot?.id);
      assert.equal(first.truth_fingerprint, first.snapshot?.id);
      assert.equal(first.truth_fingerprint_context?.version, 1);
    }));

    results.push(record("set-like arrays stay stable under permutation in replay fixtures", () => {
      const fixture = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z");
      const permuted = deepClone(fixture) as ManifestLike;
      const supportedModes = permuted.semantic_snapshot?.input_contract?.supported_modes;
      if (!supportedModes) {
        throw new Error("Expected supported_modes to exist in the fixture.");
      }
      permuted.semantic_snapshot!.input_contract!.supported_modes = [...supportedModes].reverse();

      const canonical = computeGreenfieldSourceTruthFingerprint(toLayer(fixture));
      const recomputed = computeGreenfieldSourceTruthFingerprint(toLayer(permuted));

      assert.equal(canonical.truth_fingerprint, recomputed.truth_fingerprint);
      assert.equal(canonical.truth_fingerprint_context.canonicalization_version, recomputed.truth_fingerprint_context.canonicalization_version);
    }));

    results.push(record("changing replay seed changes the fingerprint but not semantic payload", () => {
      const first = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z");
      const second = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:01.000Z");

      assert.notEqual(first.truth_fingerprint, second.truth_fingerprint);
      assert.equal(first.semantic_snapshot?.version, second.semantic_snapshot?.version);
      assert.equal(first.semantic_snapshot?.input_contract?.supported_modes?.join(","), second.semantic_snapshot?.input_contract?.supported_modes?.join(","));
    }));

    results.push(record("written fixture round-trips through the file verifier", () => {
      const manifestPath = path.join(root, ".spec", "greenfield", "source-documents.active.yaml");
      fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
      fs.writeFileSync(manifestPath, renderManifest(buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z")), "utf-8");

      const verified = verifyGreenfieldSourceSnapshotFile(manifestPath);
      assert.equal(verified.valid, true);
      assert.equal(verified.truth_fingerprint, buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z").truth_fingerprint);
      assert.equal(verified.truth_fingerprint_context?.engine_version, "greenfield-source-documents@1");
      assert.ok(fs.readFileSync(manifestPath, "utf-8").includes("truth_fingerprint_context"));
    }));

    results.push(record("corrupted canonical metadata is rejected by the verifier", () => {
      const fixture = buildManifest(inputContract, root, requirementsPath, technicalSolutionPath, "2026-05-10T00:00:00.000Z");
      const corrupted = deepClone(fixture) as ManifestLike;
      corrupted.truth_fingerprint_context!.canonicalization_schema_version = 2;

      const result = verifyGreenfieldSourceSnapshotFile(writeTempManifest(root, corrupted));

      assert.equal(result.valid, false);
      assert.ok(result.issues.some((issue) => issue.code === "GREENFIELD_SNAPSHOT_CONTEXT_MISMATCH"));
    }));
  } catch (error) {
    results.push({
      name: "greenfield deterministic fixture execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }

  printResults(results);
}

function buildManifest(
  inputContract: ReturnType<typeof loadGreenfieldSourceDocuments>,
  root: string,
  requirementsPath: string,
  technicalSolutionPath: string,
  generatedAt: string,
): ManifestLike {
  return buildGreenfieldSourceDocumentsManifest(inputContract, {
    root,
    requirementsPath,
    technicalSolutionPath,
    snapshotStatus: "proposed",
    generatedAt,
  }) as ManifestLike;
}

function writeTempManifest(root: string, manifest: ManifestLike): string {
  const manifestPath = path.join(root, ".spec", "greenfield", "corrupted-source-documents.active.yaml");
  fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
  fs.writeFileSync(manifestPath, renderManifest(manifest), "utf-8");
  return manifestPath;
}

function toLayer(manifest: ManifestLike): GreenfieldSourceSnapshotLayerModel {
  if (!manifest.semantic_snapshot || !manifest.replay_seed) {
    throw new Error("Fixture manifest is missing the snapshot layer.");
  }

  return {
    semantic_snapshot: manifest.semantic_snapshot as GreenfieldSourceSnapshotLayerModel["semantic_snapshot"],
    replay_seed: manifest.replay_seed as GreenfieldSourceSnapshotLayerModel["replay_seed"],
  };
}

function renderManifest(manifest: ManifestLike): string {
  return yaml.dump(manifest, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function deepClone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
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
    "Build a commerce platform for checkout and order creation.",
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
    "- Checkout should stay responsive.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
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
  ].join("\n");
}

void main();
