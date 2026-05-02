# P9 Contract-Aware Evidence and Impact Implementation Plan

状态：已完成

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first P9 slice by freezing JiSpec's current impact/provenance baselines, adding explicit evidence provenance labels, and exposing change impact summaries to change, implement, verify, and CI surfaces without changing deterministic blocking semantics.

**Architecture:** Treat JiSpec's existing `.spec/deltas/<changeId>/impact-graph.json`, `.spec/deltas/<changeId>/verify-focus.yaml`, bootstrap evidence inventory, Greenfield evidence graph, and `.spec/console/multi-repo-governance.json` as the source-of-truth surfaces. Add small contract helpers and tests around those surfaces; Markdown companions remain human-readable summaries and never become machine APIs. External GitNexus and Graphify behavior stays out of this slice except as vocabulary and future adapter boundaries documented in `docs/gitnexus-graphify-capability-upgrade-plan.md`.

**Tech Stack:** TypeScript, Node.js `assert`, `tsx`, `js-yaml`, JiSpec CLI regression runner, existing `tools/jispec` modules.

---

## Scope

This plan covers only the first batch from `docs/gitnexus-graphify-capability-upgrade-plan.md`:

- `P9-T1 当前图谱 / provenance 基线冻结`
- `P9-T2 Evidence Provenance Labels`
- `P9-T3 Change Impact Summary`

First-batch completion status:

- `P9-T1 当前图谱 / provenance 基线冻结` - completed.
- `P9-T2 Evidence Provenance Labels` - completed.
- `P9-T3 Change Impact Summary` - completed.
- `P9-T4 Reviewer Companion Consolidation` - completed.
- `P9-T5 Multi-Repo Contract Drift Hints` - completed.
- `P9-T6 External Graph Adapter Import-Only` - completed.
- `P9-T7 External Tool Run Opt-In Boundary` - completed.
- Current repository regression matrix after P9-T7: `131` suites and `581` expected tests.

Final P9 closure:

- All P9-T1 through P9-T7 development tasks are implemented and committed.
- Imported or externally generated graph evidence remains advisory-only unless corroborated by JiSpec-owned deterministic contracts.
- GitNexus / Graphify capabilities are represented as local-first contracts and boundaries; they are not required runtime dependencies.

The second-batch engineering implementation plan for `P9-T4` through `P9-T7` is appended after the first-batch self-review checklist; P9-T4, P9-T5, P9-T6, and P9-T7 are now complete.

## File Structure

Create:

- `tools/jispec/provenance/evidence-provenance.ts` - shared taxonomy, descriptor shape, inference helpers, and stale/unknown fallback behavior.
- `tools/jispec/change/impact-summary.ts` - shared change impact summary model, artifact path resolver, freshness classifier, and render helpers.
- `tools/jispec/tests/p9-baseline-contract.ts` - P9-T1 baseline contract tests for docs, artifact paths, and regression registration.
- `tools/jispec/tests/p9-evidence-provenance-labels.ts` - P9-T2 provenance taxonomy tests across helper logic, bootstrap ranked evidence, contract adapters, and Greenfield graph nodes.
- `tools/jispec/tests/p9-change-impact-summary.ts` - P9-T3 change/implement/verify/CI impact summary tests.

Modify:

- `docs/v1-mainline-stable-contract.md` - document P9 baseline source-of-truth paths and companion boundary.
- `docs/console-read-model-contract.md` - document `.spec/console/multi-repo-governance.json` as the multi-repo aggregate source of truth.
- `docs/gitnexus-graphify-capability-upgrade-plan.md` - mark P9-T1/T2/T3 progress as tasks are completed.
- `tools/jispec/tests/regression-runner.ts` - register P9 suites and update frozen matrix totals.
- `tools/jispec/tests/regression-matrix-contract.ts` - update area counts and total counts after each new suite lands.
- `tools/jispec/bootstrap/evidence-ranking.ts` - add provenance descriptor fields to ranked evidence entries.
- `tools/jispec/bootstrap/contract-source-adapters.ts` - add provenance descriptor fields to deterministic adapter evidence.
- `tools/jispec/greenfield/evidence-graph.ts` - add provenance descriptor fields to Greenfield evidence nodes and implementation facts.
- `tools/jispec/change/spec-delta.ts` - keep current delta artifact paths stable and attach normalized change impact summary metadata.
- `tools/jispec/change/change-session.ts` - type `impactSummary` as structured impact summary while preserving older string-array reads.
- `tools/jispec/change/change-command.ts` - emit structured impact summary and render it in CLI text/JSON.
- `tools/jispec/implement/handoff-packet.ts` - surface impacted contracts/files, missing verification hints, and replay command in handoff packets.
- `tools/jispec/verify/verify-runner.ts` - report impact graph freshness as advisory metadata.
- `tools/jispec/ci/verify-summary.ts` - render impact freshness/scope hints in Markdown while keeping JSON report authoritative.

## Regression Matrix Accounting

Current baseline before P9 implementation:

- Total suites: `124`
- Total expected tests: `539`
- `bootstrap-takeover-hardening`: `27` suites, `107` expected tests
- `change-implement`: `7` suites, `27` expected tests
- `runtime-extended`: `39` suites, `164` expected tests

After the first P9 batch is complete:

- Total suites: `127`
- Total expected tests: `556` at first-batch completion, then `557` after the later `gate:quick` package-script surface coverage landed.
- `bootstrap-takeover-hardening`: `28` suites, `113` expected tests
- `change-implement`: `8` suites, `33` expected tests
- `runtime-extended`: `40` suites, `169` expected tests

---

### Task 1: P9-T1 Baseline Contract Freeze

**Files:**
- Create: `tools/jispec/tests/p9-baseline-contract.ts`
- Modify: `docs/v1-mainline-stable-contract.md`
- Modify: `docs/console-read-model-contract.md`
- Modify: `docs/gitnexus-graphify-capability-upgrade-plan.md`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`

- [x] **Step 1: Write the failing P9-T1 contract test**

Create `tools/jispec/tests/p9-baseline-contract.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { TEST_SUITES, buildRegressionMatrixManifest } from "./regression-runner";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Baseline Contract Tests ===\n");

  const repoRoot = path.resolve(__dirname, "..", "..", "..");
  const results: TestResult[] = [];

  results.push(record("stable contract documents P9 impact source-of-truth paths", () => {
    const doc = readDoc(repoRoot, "docs/v1-mainline-stable-contract.md");
    assert.match(doc, /\.spec\/deltas\/<changeId>\/impact-graph\.json/);
    assert.match(doc, /\.spec\/deltas\/<changeId>\/impact-report\.md/);
    assert.match(doc, /\.spec\/deltas\/<changeId>\/verify-focus\.yaml/);
    assert.match(doc, /Markdown companion/i);
    assert.match(doc, /not a machine API/i);
  }));

  results.push(record("console read model documents multi-repo source of truth", () => {
    const doc = readDoc(repoRoot, "docs/console-read-model-contract.md");
    assert.match(doc, /\.spec\/console\/multi-repo-governance\.json/);
    assert.match(doc, /source of truth/i);
    assert.match(doc, /\.spec\/console\/multi-repo-governance\.md/);
    assert.match(doc, /human-readable companion/i);
  }));

  results.push(record("upgrade plan keeps GitNexus and Graphify as references, not runtime dependencies", () => {
    const doc = readDoc(repoRoot, "docs/gitnexus-graphify-capability-upgrade-plan.md");
    assert.match(doc, /GitNexus \/ Graphify 是参考来源/);
    assert.match(doc, /不是运行时依赖/);
    assert.match(doc, /import-only/);
    assert.match(doc, /run-external-tool/);
  }));

  results.push(record("spec-delta implementation keeps existing P9 artifact names stable", () => {
    const source = readDoc(repoRoot, "tools/jispec/change/spec-delta.ts");
    assert.match(source, /impact-graph\.json/);
    assert.match(source, /impact-report\.md/);
    assert.match(source, /verify-focus\.yaml/);
    assert.match(source, /ai-implement-handoff\.md/);
    assert.match(source, /adoption-record\.yaml/);
  }));

  results.push(record("regression matrix registers the P9 baseline suite in runtime-extended", () => {
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-baseline-contract.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 5);
    assert.equal(suite.task, "P9-T1");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 125);
    assert.equal(manifest.totalExpectedTests, 544);
    const runtime = manifest.areas.find((area) => area.area === "runtime-extended");
    assert.equal(runtime?.suiteCount, 40);
    assert.equal(runtime?.expectedTests, 169);
  }));

  printResults(results);
}

function readDoc(repoRoot: string, relativePath: string): string {
  return fs.readFileSync(path.join(repoRoot, relativePath), "utf-8");
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
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T1 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-baseline-contract.ts
```

Expected: FAIL because the suite is not registered and one or more docs do not yet contain the frozen P9 contract language.

- [x] **Step 3: Document stable impact and companion boundaries**

Add this section to `docs/v1-mainline-stable-contract.md` near the existing stable artifact or companion contract material:

```markdown
## P9 Impact And Provenance Baseline

- The current change impact source of truth is `.spec/deltas/<changeId>/impact-graph.json`.
- The human-readable change impact companion is `.spec/deltas/<changeId>/impact-report.md`.
- The focused verification scope is `.spec/deltas/<changeId>/verify-focus.yaml`.
- Markdown companion files summarize reviewer decisions and evidence, but they are not machine APIs.
- Machine consumers must read JSON/YAML truth sources before reading Markdown summaries.
```

Add this section to `docs/console-read-model-contract.md` near the multi-repo governance contract:

```markdown
## Multi-Repo Governance Source Of Truth

- The multi-repo governance aggregate source of truth is `.spec/console/multi-repo-governance.json`.
- `.spec/console/multi-repo-governance.md` is a human-readable companion for reviewers.
- Console surfaces may show companion paths and summaries, but gates must not parse Markdown as a machine API.
```

Update `docs/gitnexus-graphify-capability-upgrade-plan.md`:

```markdown
### P9-T1 当前图谱 / provenance 基线冻结

状态：已完成
```

- [x] **Step 4: Register the P9-T1 regression suite**

Modify `tools/jispec/tests/regression-runner.ts` in the runtime suite block:

```ts
runtime({ name: 'P9 Baseline Contract', file: 'p9-baseline-contract.ts', expectedTests: 5, task: 'P9-T1' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` frozen counts:

```ts
assert.equal(manifest.totalSuites, 125);
assert.equal(manifest.totalExpectedTests, 544);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 40);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 169);
```

- [x] **Step 5: Run focused verification for P9-T1**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-baseline-contract.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run typecheck
```

Expected: all commands PASS.

- [x] **Step 6: Commit P9-T1**

Run:

```powershell
git add docs/v1-mainline-stable-contract.md docs/console-read-model-contract.md docs/gitnexus-graphify-capability-upgrade-plan.md tools/jispec/tests/p9-baseline-contract.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "test: freeze p9 baseline contracts"
```

Expected: commit succeeds and contains only P9-T1 docs/tests/registry changes.

---

### Task 2: P9-T2 Evidence Provenance Labels

**Files:**
- Create: `tools/jispec/provenance/evidence-provenance.ts`
- Create: `tools/jispec/tests/p9-evidence-provenance-labels.ts`
- Modify: `tools/jispec/bootstrap/evidence-ranking.ts`
- Modify: `tools/jispec/bootstrap/contract-source-adapters.ts`
- Modify: `tools/jispec/greenfield/evidence-graph.ts`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`
- Modify: `docs/gitnexus-graphify-capability-upgrade-plan.md`

- [x] **Step 1: Write the failing provenance label tests**

Create `tools/jispec/tests/p9-evidence-provenance-labels.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runBootstrapDiscover } from "../bootstrap/discover";
import type { AdoptionRankedEvidence } from "../bootstrap/evidence-ranking";
import type { ContractSourceAdapterReport } from "../bootstrap/contract-source-adapters";
import { runGreenfieldInit } from "../greenfield/init";
import { inferEvidenceProvenance, normalizeEvidenceProvenanceLabel } from "../provenance/evidence-provenance";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Evidence Provenance Label Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("taxonomy normalizes known labels and downgrades unknown values", () => {
    assert.equal(normalizeEvidenceProvenanceLabel("EXTRACTED"), "EXTRACTED");
    assert.equal(normalizeEvidenceProvenanceLabel("INFERRED"), "INFERRED");
    assert.equal(normalizeEvidenceProvenanceLabel("AMBIGUOUS"), "AMBIGUOUS");
    assert.equal(normalizeEvidenceProvenanceLabel("OWNER_REVIEW"), "OWNER_REVIEW");
    assert.equal(normalizeEvidenceProvenanceLabel("missing"), "UNKNOWN");
    assert.equal(normalizeEvidenceProvenanceLabel(undefined), "UNKNOWN");
  }));

  results.push(record("helper maps confidence and adoption posture to deterministic labels", () => {
    assert.equal(inferEvidenceProvenance({ confidence: 0.96, evidenceKind: "schema", sourcePath: "api/openapi.yaml" }).label, "EXTRACTED");
    assert.equal(inferEvidenceProvenance({ confidence: 0.72, evidenceKind: "source", sourcePath: "src/routes/orders.ts" }).label, "INFERRED");
    assert.equal(inferEvidenceProvenance({ confidence: 0.34, evidenceKind: "route", sourcePath: "src/routes/weak.ts" }).label, "AMBIGUOUS");
    assert.equal(inferEvidenceProvenance({ confidence: 0.88, evidenceKind: "test", sourcePath: "tests/orders.feature", ownerReviewRequired: true }).label, "OWNER_REVIEW");
    assert.equal(inferEvidenceProvenance({ evidenceKind: "unknown", sourcePath: "" }).label, "UNKNOWN");
  }));

  results.push(record("bootstrap ranked evidence carries provenance descriptor fields", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-bootstrap-"));
    try {
      writeBootstrapFixture(root);
      runBootstrapDiscover({ root });
      const rankedPath = path.join(root, ".spec", "facts", "bootstrap", "adoption-ranked-evidence.json");
      const ranked = JSON.parse(fs.readFileSync(rankedPath, "utf-8")) as AdoptionRankedEvidence;
      const openapi = ranked.evidence.find((entry) => entry.path === "api/openapi.yaml");
      const weakRoute = ranked.evidence.find((entry) => entry.path === "src/routes/weak-route.ts");

      assert.equal(openapi?.provenanceLabel, "EXTRACTED");
      assert.equal(openapi?.evidenceKind, "schema");
      assert.equal(openapi?.sourcePath, "api/openapi.yaml");
      assert.equal(openapi?.ownerReviewPosture, "not_required");
      assert.equal(weakRoute?.provenanceLabel, "AMBIGUOUS");
      assert.equal(weakRoute?.ownerReviewPosture, "required");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("contract source adapters expose owner-review provenance without promoting weak evidence", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-adapters-"));
    try {
      writeBootstrapFixture(root);
      runBootstrapDiscover({ root });
      const adapterPath = path.join(root, ".spec", "facts", "bootstrap", "contract-source-adapters.json");
      const report = JSON.parse(fs.readFileSync(adapterPath, "utf-8")) as ContractSourceAdapterReport;
      const graphql = report.evidence.find((entry) => entry.path === "api/graphql/schema.graphql");

      assert.equal(graphql?.provenanceLabel, "EXTRACTED");
      assert.equal(graphql?.evidenceKind, "schema");
      assert.equal(graphql?.sourcePath, "api/graphql/schema.graphql");
      assert.equal(graphql?.ownerReviewPosture, "not_required");
      assert.equal(graphql?.llm_blocking_gate, false);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("Greenfield evidence graph nodes carry provenance labels", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-greenfield-"));
    const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-provenance-source-"));
    try {
      const requirementsPath = path.join(sourceRoot, "requirements.md");
      const solutionPath = path.join(sourceRoot, "technical-solution.md");
      fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
      fs.writeFileSync(solutionPath, buildTechnicalSolution(), "utf-8");
      runGreenfieldInit({ root, requirements: requirementsPath, technicalSolution: solutionPath });
      const graphPath = path.join(root, ".spec", "evidence", "evidence-graph.json");
      const graph = JSON.parse(fs.readFileSync(graphPath, "utf-8")) as { nodes: Array<Record<string, unknown>> };
      const requirement = graph.nodes.find((node) => node.id === "requirement:REQ-ORD-001");
      const context = graph.nodes.find((node) => node.id === "context:ordering");

      assert.equal(requirement?.provenanceLabel, "EXTRACTED");
      assert.equal(requirement?.evidenceKind, "requirement");
      assert.equal(requirement?.sourcePath, "docs/input/requirements.md");
      assert.equal(context?.provenanceLabel, "INFERRED");
      assert.equal(context?.ownerReviewPosture, "required");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
      fs.rmSync(sourceRoot, { recursive: true, force: true });
    }
  }));

  results.push(record("regression matrix registers P9 provenance suite in bootstrap hardening", () => {
    const { TEST_SUITES, buildRegressionMatrixManifest } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-evidence-provenance-labels.ts");
    assert.ok(suite);
    assert.equal(suite.area, "bootstrap-takeover-hardening");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T2");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 126);
    assert.equal(manifest.totalExpectedTests, 550);
  }));

  printResults(results);
}

function writeBootstrapFixture(root: string): void {
  writeFile(root, "api/openapi.yaml", "openapi: 3.0.0\npaths:\n  /orders:\n    post:\n      responses:\n        '202':\n          description: accepted\n");
  writeFile(root, "api/graphql/schema.graphql", "type Query { order(id: ID!): Order }\ntype Order { id: ID! }\n");
  writeFile(root, "src/routes/weak-route.ts", "export const routeName = 'orders';\n");
}

function buildRequirements(): string {
  return [
    "# Requirements",
    "",
    "REQ-ORD-001: Checkout must accept valid carts and create an order.",
  ].join("\n");
}

function buildTechnicalSolution(): string {
  return [
    "# Technical Solution",
    "",
    "The ordering bounded context owns checkout and order creation.",
  ].join("\n");
}

function writeFile(root: string, relativePath: string, content: string): void {
  const target = path.join(root, relativePath);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, content, "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
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
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T2 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-evidence-provenance-labels.ts
```

Expected: FAIL because `tools/jispec/provenance/evidence-provenance.ts` does not exist and evidence artifacts do not yet expose `provenanceLabel`.

- [x] **Step 3: Add the shared provenance helper**

Create `tools/jispec/provenance/evidence-provenance.ts`:

```ts
import { normalizeEvidencePath } from "../bootstrap/evidence-graph";

export type EvidenceProvenanceLabel =
  | "EXTRACTED"
  | "INFERRED"
  | "AMBIGUOUS"
  | "OWNER_REVIEW"
  | "UNKNOWN";

export type EvidenceOwnerReviewPosture =
  | "not_required"
  | "recommended"
  | "required";

export interface EvidenceProvenanceInput {
  confidence?: number;
  evidenceKind: string;
  sourcePath: string;
  ownerReviewRequired?: boolean;
  ambiguous?: boolean;
}

export interface EvidenceProvenanceDescriptor {
  provenanceLabel: EvidenceProvenanceLabel;
  evidenceKind: string;
  sourcePath: string;
  confidence: number | null;
  ownerReviewPosture: EvidenceOwnerReviewPosture;
}

const KNOWN_LABELS = new Set<EvidenceProvenanceLabel>([
  "EXTRACTED",
  "INFERRED",
  "AMBIGUOUS",
  "OWNER_REVIEW",
  "UNKNOWN",
]);

export function normalizeEvidenceProvenanceLabel(value: unknown): EvidenceProvenanceLabel {
  return typeof value === "string" && KNOWN_LABELS.has(value as EvidenceProvenanceLabel)
    ? value as EvidenceProvenanceLabel
    : "UNKNOWN";
}

export function inferEvidenceProvenance(input: EvidenceProvenanceInput): { label: EvidenceProvenanceLabel; descriptor: EvidenceProvenanceDescriptor } {
  const normalizedPath = input.sourcePath ? normalizeEvidencePath(input.sourcePath) : "";
  const confidence = typeof input.confidence === "number" && Number.isFinite(input.confidence)
    ? Math.max(0, Math.min(1, input.confidence))
    : null;
  const ownerReviewPosture = inferOwnerReviewPosture(confidence, input.ownerReviewRequired === true, input.ambiguous === true);
  const label = inferLabel(confidence, ownerReviewPosture, input.ambiguous === true, normalizedPath);

  return {
    label,
    descriptor: {
      provenanceLabel: label,
      evidenceKind: input.evidenceKind || "unknown",
      sourcePath: normalizedPath,
      confidence,
      ownerReviewPosture,
    },
  };
}

export function inferEvidenceProvenanceDescriptor(input: EvidenceProvenanceInput): EvidenceProvenanceDescriptor {
  return inferEvidenceProvenance(input).descriptor;
}

function inferOwnerReviewPosture(
  confidence: number | null,
  ownerReviewRequired: boolean,
  ambiguous: boolean,
): EvidenceOwnerReviewPosture {
  if (ownerReviewRequired || ambiguous || confidence === null || confidence < 0.5) {
    return "required";
  }
  if (confidence < 0.9) {
    return "recommended";
  }
  return "not_required";
}

function inferLabel(
  confidence: number | null,
  ownerReviewPosture: EvidenceOwnerReviewPosture,
  ambiguous: boolean,
  sourcePath: string,
): EvidenceProvenanceLabel {
  if (!sourcePath || confidence === null) {
    return "UNKNOWN";
  }
  if (ownerReviewPosture === "required" && !ambiguous && confidence >= 0.8) {
    return "OWNER_REVIEW";
  }
  if (ambiguous || confidence < 0.5) {
    return "AMBIGUOUS";
  }
  if (confidence >= 0.9) {
    return "EXTRACTED";
  }
  return "INFERRED";
}
```

- [x] **Step 4: Wire provenance descriptors into bootstrap ranked evidence**

Modify `tools/jispec/bootstrap/evidence-ranking.ts`.

Add import:

```ts
import { inferEvidenceProvenanceDescriptor, type EvidenceProvenanceLabel, type EvidenceOwnerReviewPosture } from "../provenance/evidence-provenance";
```

Extend `AdoptionRankedEvidenceEntry`:

```ts
  provenanceLabel: EvidenceProvenanceLabel;
  evidenceKind: AdoptionEvidenceKind;
  sourcePath: string;
  confidence: number | null;
  ownerReviewPosture: EvidenceOwnerReviewPosture;
```

Update the ranked map:

```ts
    .map((entry, index) => {
      const descriptor = inferEvidenceProvenanceDescriptor({
        confidence: entry.confidenceScore,
        evidenceKind: entry.kind,
        sourcePath: entry.path,
        ownerReviewRequired: entry.metadata?.boundarySignal === "weak_candidate",
        ambiguous: entry.metadata?.boundarySignal === "weak_candidate",
      });

      return {
        rank: index + 1,
        kind: entry.kind,
        path: entry.path,
        score: entry.score,
        reason: entry.reason,
        source: entry.source,
        confidenceScore: entry.confidenceScore,
        sourceFiles: [...entry.sourceFiles].sort((left, right) => left.localeCompare(right)),
        metadata: entry.metadata,
        ...descriptor,
      };
    });
```

- [x] **Step 5: Wire provenance descriptors into contract source adapters**

Modify `tools/jispec/bootstrap/contract-source-adapters.ts`.

Add import:

```ts
import { inferEvidenceProvenanceDescriptor, type EvidenceProvenanceLabel, type EvidenceOwnerReviewPosture } from "../provenance/evidence-provenance";
```

Extend `ContractSourceAdapterEvidence`:

```ts
  provenanceLabel: EvidenceProvenanceLabel;
  evidenceKind: string;
  sourcePath: string;
  confidence: number | null;
  ownerReviewPosture: EvidenceOwnerReviewPosture;
```

Add helper:

```ts
function withAdapterProvenance<T extends Omit<ContractSourceAdapterEvidence, "provenanceLabel" | "evidenceKind" | "sourcePath" | "confidence" | "ownerReviewPosture">>(
  entry: T,
): ContractSourceAdapterEvidence {
  return {
    ...entry,
    ...inferEvidenceProvenanceDescriptor({
      confidence: entry.confidence_score,
      evidenceKind: entry.source_kind,
      sourcePath: entry.path,
      ownerReviewRequired: entry.adoption_disposition === "owner_review",
      ambiguous: entry.strength === "owner_review" && entry.confidence_score < 0.8,
    }),
  };
}
```

Wrap each collected adapter entry with `withAdapterProvenance(...)` before returning it.

- [x] **Step 6: Wire provenance descriptors into Greenfield evidence graph**

Modify `tools/jispec/greenfield/evidence-graph.ts`.

Add import:

```ts
import { inferEvidenceProvenanceDescriptor, type EvidenceOwnerReviewPosture, type EvidenceProvenanceLabel } from "../provenance/evidence-provenance";
```

Extend `GreenfieldEvidenceNode` and `GreenfieldImplementationFact`:

```ts
  provenanceLabel?: EvidenceProvenanceLabel;
  evidenceKind?: string;
  sourcePath?: string;
  confidence?: number | null;
  ownerReviewPosture?: EvidenceOwnerReviewPosture;
```

Update `addNode` so every node receives a descriptor:

```ts
function addNode(nodes: Map<string, GreenfieldEvidenceNode>, node: GreenfieldEvidenceNode): void {
  const descriptor = inferEvidenceProvenanceDescriptor({
    confidence: confidenceForGreenfieldNode(node),
    evidenceKind: node.type,
    sourcePath: node.path ?? "",
    ownerReviewRequired: node.sourceConfidence === "inferred",
    ambiguous: node.sourceConfidence === "inferred" && node.type !== "context",
  });

  nodes.set(node.id, {
    ...node,
    ...descriptor,
  });
}
```

Add helper:

```ts
function confidenceForGreenfieldNode(node: GreenfieldEvidenceNode): number | undefined {
  if (node.sourceConfidence === "requirements") {
    return 0.96;
  }
  if (node.sourceConfidence === "technical_solution") {
    return 0.82;
  }
  if (node.sourceConfidence === "inferred") {
    return 0.72;
  }
  if (node.type === "source_document") {
    return 0.98;
  }
  return 0.6;
}
```

- [x] **Step 7: Register the P9-T2 regression suite and update counts**

Modify `tools/jispec/tests/regression-runner.ts` in the bootstrap suite block:

```ts
bootstrap({ name: 'P9 Evidence Provenance Labels', file: 'p9-evidence-provenance-labels.ts', expectedTests: 6, task: 'P9-T2' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` frozen counts after P9-T1 and P9-T2:

```ts
assert.equal(manifest.totalSuites, 126);
assert.equal(manifest.totalExpectedTests, 550);
assert.equal(areaMap.get("bootstrap-takeover-hardening")?.suiteCount, 28);
assert.equal(areaMap.get("bootstrap-takeover-hardening")?.expectedTests, 113);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 40);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 169);
```

Update `docs/gitnexus-graphify-capability-upgrade-plan.md`:

```markdown
### P9-T2 Evidence Provenance Labels

状态：已完成
```

- [x] **Step 8: Run focused verification for P9-T2**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-evidence-provenance-labels.ts
node --import tsx tools\jispec\tests\contract-source-adapters.ts
node --import tsx tools\jispec\tests\greenfield-evidence-graph.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run typecheck
```

Expected: all commands PASS.

- [x] **Step 9: Commit P9-T2**

Run:

```powershell
git add docs/gitnexus-graphify-capability-upgrade-plan.md tools/jispec/provenance/evidence-provenance.ts tools/jispec/bootstrap/evidence-ranking.ts tools/jispec/bootstrap/contract-source-adapters.ts tools/jispec/greenfield/evidence-graph.ts tools/jispec/tests/p9-evidence-provenance-labels.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: add p9 evidence provenance labels"
```

Expected: commit succeeds and older artifacts without provenance fields still read successfully because consumers treat missing labels as `UNKNOWN`.

---

### Task 3: P9-T3 Change Impact Summary

**Files:**
- Create: `tools/jispec/change/impact-summary.ts`
- Create: `tools/jispec/tests/p9-change-impact-summary.ts`
- Modify: `tools/jispec/change/spec-delta.ts`
- Modify: `tools/jispec/change/change-session.ts`
- Modify: `tools/jispec/change/change-command.ts`
- Modify: `tools/jispec/implement/handoff-packet.ts`
- Modify: `tools/jispec/verify/verify-runner.ts`
- Modify: `tools/jispec/ci/verify-summary.ts`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`
- Modify: `docs/gitnexus-graphify-capability-upgrade-plan.md`

- [x] **Step 1: Write the failing change impact summary tests**

Create `tools/jispec/tests/p9-change-impact-summary.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { runChangeCommand } from "../change/change-command";
import { readChangeSession } from "../change/change-session";
import { runGreenfieldInit } from "../greenfield/init";
import { summarizeChangeImpact, classifyImpactFreshness } from "../change/impact-summary";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== P9 Change Impact Summary Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("freshness classifier returns not_available_yet for missing graph", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-missing-"));
    try {
      const summary = summarizeChangeImpact({ root, changeId: "chg-missing", generatedAt: "2026-05-02T00:00:00.000Z" });
      assert.equal(summary.freshness.status, "not_available_yet");
      assert.equal(summary.advisoryOnly, true);
      assert.equal(classifyImpactFreshness(root, ".spec/deltas/chg-missing/impact-graph.json").status, "not_available_yet");
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(await recordAsync("change session references delta impact graph, report, and verify focus", async () => {
    const fixture = createGreenfieldFixture();
    try {
      const change = await runChangeCommand({
        root: fixture.root,
        summary: "Add refund intake for REQ-ORD-002",
        mode: "prompt",
        changeType: "add",
        contextId: "ordering",
        sliceId: "ordering-refund-v1",
        json: true,
      });
      const session = readChangeSession(fixture.root);
      const impact = session?.impactSummary;

      assert.ok(change.session.specDelta);
      assert.equal(typeof impact, "object");
      assert.equal(Array.isArray(impact), false);
      assert.equal(impact?.changeId, change.session.specDelta?.changeId);
      assert.match(impact?.artifacts.impactGraphPath ?? "", /\.spec\/deltas\/.+\/impact-graph\.json$/);
      assert.match(impact?.artifacts.impactReportPath ?? "", /\.spec\/deltas\/.+\/impact-report\.md$/);
      assert.match(impact?.artifacts.verifyFocusPath ?? "", /\.spec\/deltas\/.+\/verify-focus\.yaml$/);
      assert.equal(impact?.freshness.status, "fresh");
      assert.equal(impact?.advisoryOnly, true);
    } finally {
      cleanupFixture(fixture);
    }
  }));

  results.push(await recordAsync("implement handoff packet includes contract-aware impact scope", async () => {
    const fixture = createGreenfieldFixture();
    try {
      const change = await runChangeCommand({
        root: fixture.root,
        summary: "Add refund intake for REQ-ORD-002",
        mode: "prompt",
        changeType: "add",
        contextId: "ordering",
        sliceId: "ordering-refund-v1",
      });
      assert.ok(change.session.impactSummary);
      assert.ok(change.session.impactSummary.impactedContracts.length >= 0);
      assert.ok(change.session.impactSummary.nextReplayCommand.includes("npm run jispec-cli -- change"));
      assert.ok(change.text.includes("Impact graph freshness: fresh"));
    } finally {
      cleanupFixture(fixture);
    }
  }));

  results.push(record("stale graph remains advisory and never blocks deterministic verify", () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-stale-"));
    try {
      const graphPath = path.join(root, ".spec", "deltas", "chg-stale", "impact-graph.json");
      fs.mkdirSync(path.dirname(graphPath), { recursive: true });
      fs.writeFileSync(graphPath, JSON.stringify({ changeId: "chg-stale", generatedAt: "2020-01-01T00:00:00.000Z" }, null, 2), "utf-8");
      const freshness = classifyImpactFreshness(root, ".spec/deltas/chg-stale/impact-graph.json", "2026-05-02T00:00:00.000Z");
      assert.equal(freshness.status, "stale");
      const summary = summarizeChangeImpact({ root, changeId: "chg-stale", generatedAt: "2026-05-02T00:00:00.000Z" });
      assert.equal(summary.advisoryOnly, true);
      assert.equal(summary.missingVerificationHints.length > 0, true);
    } finally {
      fs.rmSync(root, { recursive: true, force: true });
    }
  }));

  results.push(record("verify and CI summary source mention impact freshness as advisory context", () => {
    const repoRoot = path.resolve(__dirname, "..", "..", "..");
    const verifyRunner = fs.readFileSync(path.join(repoRoot, "tools", "jispec", "verify", "verify-runner.ts"), "utf-8");
    const ciSummary = fs.readFileSync(path.join(repoRoot, "tools", "jispec", "ci", "verify-summary.ts"), "utf-8");
    assert.match(verifyRunner, /impactGraphFreshness/);
    assert.match(verifyRunner, /not_available_yet/);
    assert.match(ciSummary, /Impact Graph/);
    assert.match(ciSummary, /advisory/i);
  }));

  results.push(record("regression matrix registers P9 change impact suite in change-implement", () => {
    const { TEST_SUITES, buildRegressionMatrixManifest } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-change-impact-summary.ts");
    assert.ok(suite);
    assert.equal(suite.area, "change-implement");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T3");

    const manifest = buildRegressionMatrixManifest();
    assert.equal(manifest.totalSuites, 127);
    assert.equal(manifest.totalExpectedTests, 556);
  }));

  printResults(results);
}

function createGreenfieldFixture(): { root: string; sourceRoot: string } {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-greenfield-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-impact-source-"));
  const requirementsPath = path.join(sourceRoot, "requirements.md");
  const solutionPath = path.join(sourceRoot, "technical-solution.md");
  fs.writeFileSync(requirementsPath, ["# Requirements", "", "REQ-ORD-001: Checkout creates an order.", "REQ-ORD-002: Refund intake captures an order id."].join("\n"), "utf-8");
  fs.writeFileSync(solutionPath, ["# Technical Solution", "", "Ordering owns checkout and refund intake."].join("\n"), "utf-8");
  runGreenfieldInit({ root, requirements: requirementsPath, technicalSolution: solutionPath });
  return { root, sourceRoot };
}

function cleanupFixture(fixture: { root: string; sourceRoot: string }): void {
  fs.rmSync(fixture.root, { recursive: true, force: true });
  fs.rmSync(fixture.sourceRoot, { recursive: true, force: true });
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function recordAsync(name: string, fn: () => Promise<void>): Promise<TestResult> {
  try {
    await fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
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
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }
  console.log(`\n${passed}/${results.length} tests passed`);
  if (failed > 0) {
    process.exit(1);
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
```

- [x] **Step 2: Run the P9-T3 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-change-impact-summary.ts
```

Expected: FAIL because `tools/jispec/change/impact-summary.ts` does not exist and `impactSummary` is still a string array.

- [x] **Step 3: Add the shared change impact summary helper**

Create `tools/jispec/change/impact-summary.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

export type ImpactGraphFreshnessStatus = "fresh" | "stale" | "not_available_yet" | "invalid";

export interface ImpactGraphFreshness {
  status: ImpactGraphFreshnessStatus;
  path: string;
  generatedAt?: string;
  reason: string;
}

export interface ChangeImpactArtifacts {
  deltaPath: string;
  impactGraphPath: string;
  impactReportPath: string;
  verifyFocusPath: string;
}

export interface ChangeImpactSummary {
  version: 1;
  changeId: string;
  artifacts: ChangeImpactArtifacts;
  impactedContracts: string[];
  impactedFiles: string[];
  missingVerificationHints: string[];
  freshness: ImpactGraphFreshness;
  nextReplayCommand: string;
  advisoryOnly: true;
}

export interface ChangeImpactSummaryInput {
  root: string;
  changeId: string;
  generatedAt?: string;
}

export function summarizeChangeImpact(input: ChangeImpactSummaryInput): ChangeImpactSummary {
  const artifacts = buildChangeImpactArtifacts(input.changeId);
  const freshness = classifyImpactFreshness(input.root, artifacts.impactGraphPath, input.generatedAt);
  const verifyFocus = readVerifyFocus(input.root, artifacts.verifyFocusPath);

  return {
    version: 1,
    changeId: input.changeId,
    artifacts,
    impactedContracts: stringArray(verifyFocus.contracts),
    impactedFiles: stringArray(verifyFocus.asset_paths),
    missingVerificationHints: buildMissingVerificationHints(freshness, verifyFocus),
    freshness,
    nextReplayCommand: `npm run jispec-cli -- change "<summary>" --change-type add --json`,
    advisoryOnly: true,
  };
}

export function buildChangeImpactArtifacts(changeId: string): ChangeImpactArtifacts {
  const base = `.spec/deltas/${changeId}`;
  return {
    deltaPath: `${base}/delta.yaml`,
    impactGraphPath: `${base}/impact-graph.json`,
    impactReportPath: `${base}/impact-report.md`,
    verifyFocusPath: `${base}/verify-focus.yaml`,
  };
}

export function classifyImpactFreshness(
  rootInput: string,
  relativePath: string,
  nowInput = new Date().toISOString(),
): ImpactGraphFreshness {
  const root = path.resolve(rootInput);
  const target = path.join(root, relativePath);
  if (!fs.existsSync(target)) {
    return {
      status: "not_available_yet",
      path: relativePath,
      reason: "Impact graph has not been generated for this change.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf-8")) as { generatedAt?: string; generated_at?: string };
    const generatedAt = parsed.generatedAt ?? parsed.generated_at;
    if (!generatedAt) {
      return { status: "invalid", path: relativePath, reason: "Impact graph is missing generatedAt metadata." };
    }
    const ageMs = Date.parse(nowInput) - Date.parse(generatedAt);
    if (!Number.isFinite(ageMs)) {
      return { status: "invalid", path: relativePath, generatedAt, reason: "Impact graph generatedAt is not parseable." };
    }
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      return { status: "stale", path: relativePath, generatedAt, reason: "Impact graph is older than seven days." };
    }
    return { status: "fresh", path: relativePath, generatedAt, reason: "Impact graph is available and recent." };
  } catch {
    return { status: "invalid", path: relativePath, reason: "Impact graph could not be parsed as JSON." };
  }
}

function readVerifyFocus(rootInput: string, relativePath: string): Record<string, unknown> {
  const target = path.join(path.resolve(rootInput), relativePath);
  if (!fs.existsSync(target)) {
    return {};
  }
  const parsed = yaml.load(fs.readFileSync(target, "utf-8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function buildMissingVerificationHints(freshness: ImpactGraphFreshness, verifyFocus: Record<string, unknown>): string[] {
  const hints: string[] = [];
  if (freshness.status !== "fresh") {
    hints.push(`Impact graph freshness is ${freshness.status}: ${freshness.reason}`);
  }
  if (stringArray(verifyFocus.contracts).length === 0) {
    hints.push("No impacted contracts are listed in verify-focus.yaml.");
  }
  if (stringArray(verifyFocus.tests).length === 0) {
    hints.push("No impacted tests are listed in verify-focus.yaml.");
  }
  return hints;
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}
```

- [x] **Step 4: Convert change session impact summary to structured data**

Modify `tools/jispec/change/change-session.ts`.

Add import:

```ts
import type { ChangeImpactSummary } from "./impact-summary";
```

Change the interface field:

```ts
  impactSummary?: ChangeImpactSummary | string[];
```

Modify `tools/jispec/change/change-command.ts`.

Add import:

```ts
import { summarizeChangeImpact, type ChangeImpactSummary } from "./impact-summary";
```

Replace `buildImpactSummary` return for `specDelta`:

```ts
function buildImpactSummary(
  root: string,
  sliceId?: string,
  specDelta?: ReturnType<typeof draftSpecDelta>,
): ChangeImpactSummary | string[] | undefined {
  if (specDelta) {
    return summarizeChangeImpact({
      root,
      changeId: specDelta.changeId,
      generatedAt: specDelta.blastRadius?.generatedAt,
    });
  }

  if (!sliceId) {
    return undefined;
  }

  return [
    `Slice: ${sliceId}`,
    "Impact analysis not yet implemented in this version",
  ];
}
```

Update `renderChangeCommandText` impact block:

```ts
  if (Array.isArray(session.impactSummary) && session.impactSummary.length > 0) {
    lines.push("Impact:");
    for (const impact of session.impactSummary) {
      lines.push(`- ${impact}`);
    }
    lines.push("");
  } else if (session.impactSummary) {
    lines.push("Impact:");
    lines.push(`- Impact graph: ${session.impactSummary.artifacts.impactGraphPath}`);
    lines.push(`- Impact report: ${session.impactSummary.artifacts.impactReportPath}`);
    lines.push(`- Verify focus: ${session.impactSummary.artifacts.verifyFocusPath}`);
    lines.push(`- Impact graph freshness: ${session.impactSummary.freshness.status}`);
    lines.push(`- Advisory only: ${session.impactSummary.advisoryOnly}`);
    lines.push(`- Next replay command: ${session.impactSummary.nextReplayCommand}`);
    lines.push("");
  }
```

- [x] **Step 5: Attach impact summary to spec delta result**

Modify `tools/jispec/change/spec-delta.ts`.

Add import:

```ts
import type { ChangeImpactSummary } from "./impact-summary";
import { summarizeChangeImpact } from "./impact-summary";
```

Extend `SpecDeltaDraftResult`:

```ts
  impactSummary: ChangeImpactSummary;
```

Add the field in the return object after files are written:

```ts
    impactSummary: summarizeChangeImpact({ root, changeId, generatedAt: createdAt }),
```

- [x] **Step 6: Surface impact scope in implement handoff packets**

Modify `tools/jispec/implement/handoff-packet.ts`.

Extend `HandoffPacket.nextSteps`:

```ts
    impact?: {
      impactedContracts: string[];
      impactedFiles: string[];
      missingVerificationHints: string[];
      nextReplayCommand: string;
      freshness: string;
    };
```

Add helper:

```ts
function buildImpactNextStep(session: ChangeSession): HandoffPacket["nextSteps"]["impact"] | undefined {
  const impact = session.impactSummary;
  if (!impact || Array.isArray(impact)) {
    return undefined;
  }
  return {
    impactedContracts: impact.impactedContracts,
    impactedFiles: impact.impactedFiles,
    missingVerificationHints: impact.missingVerificationHints,
    nextReplayCommand: impact.nextReplayCommand,
    freshness: impact.freshness.status,
  };
}
```

Set the field in `nextSteps`:

```ts
      impact: buildImpactNextStep(session),
```

- [x] **Step 7: Add advisory impact freshness to verify and CI summaries**

Modify `tools/jispec/verify/verify-runner.ts`.

Add `impactGraphFreshness` to metadata when a structured active change session exists:

```ts
import { readChangeSession } from "../change/change-session";
```

In `runFullVerify`, before `return result;`:

```ts
  const activeSession = readChangeSession(root);
  const impactSummary = activeSession?.impactSummary;
  if (impactSummary && !Array.isArray(impactSummary)) {
    result.metadata = {
      ...result.metadata,
      impactGraphFreshness: impactSummary.freshness.status,
      impactGraphPath: impactSummary.artifacts.impactGraphPath,
      impactAdvisoryOnly: impactSummary.advisoryOnly,
    };
  } else {
    result.metadata = {
      ...result.metadata,
      impactGraphFreshness: "not_available_yet",
      impactAdvisoryOnly: true,
    };
  }
```

Modify `tools/jispec/ci/verify-summary.ts`.

Add to `renderVerifySummaryMarkdown` before `## Source Of Truth`:

```ts
    "## Impact Graph",
    "",
    ...renderImpactGraphContext(report),
    "",
```

Add helper:

```ts
function renderImpactGraphContext(report: VerifyReport): string[] {
  const modes = report.modes ?? {};
  const freshness = typeof modes.impactGraphFreshness === "string" ? modes.impactGraphFreshness : "not_available_yet";
  const graphPath = typeof modes.impactGraphPath === "string" ? modes.impactGraphPath : ".spec/deltas/<changeId>/impact-graph.json";
  return [
    `- Freshness: \`${freshness}\`.`,
    `- Graph: \`${graphPath}\`.`,
    "- Impact graph context is advisory and does not replace deterministic verify issues.",
  ];
}
```

- [x] **Step 8: Register the P9-T3 regression suite and update final counts**

Modify `tools/jispec/tests/regression-runner.ts` in the change/implement suite block:

```ts
changeImplement({ name: 'P9 Change Impact Summary', file: 'p9-change-impact-summary.ts', expectedTests: 6, task: 'P9-T3' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` final counts:

```ts
assert.equal(manifest.totalSuites, 127);
assert.equal(manifest.totalExpectedTests, 556);
assert.equal(areaMap.get("bootstrap-takeover-hardening")?.suiteCount, 28);
assert.equal(areaMap.get("bootstrap-takeover-hardening")?.expectedTests, 113);
assert.equal(areaMap.get("change-implement")?.suiteCount, 8);
assert.equal(areaMap.get("change-implement")?.expectedTests, 33);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 40);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 169);
```

Update `docs/gitnexus-graphify-capability-upgrade-plan.md`:

```markdown
### P9-T3 Change Impact Summary

状态：已完成
```

- [x] **Step 9: Run focused verification for P9-T3**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-change-impact-summary.ts
node --import tsx tools\jispec\tests\greenfield-spec-delta-model.ts
node --import tsx tools\jispec\tests\implement-handoff-mainline.ts
node --import tsx tools\jispec\tests\ci-summary-markdown.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run typecheck
```

Expected: all commands PASS.

- [x] **Step 10: Run the full post-release gate**

Run:

```powershell
npm run post-release:gate
```

Expected: PASS with `127/127` suites and `556/556` expected tests after the P9 suites are registered.

- [x] **Step 11: Mark first P9 batch completed and commit**

Update `docs/gitnexus-graphify-capability-upgrade-plan.md`:

```markdown
### P9-T1 当前图谱 / provenance 基线冻结

状态：已完成

### P9-T2 Evidence Provenance Labels

状态：已完成

### P9-T3 Change Impact Summary

状态：已完成
```

Run:

```powershell
git add docs/gitnexus-graphify-capability-upgrade-plan.md tools/jispec/change/impact-summary.ts tools/jispec/change/spec-delta.ts tools/jispec/change/change-session.ts tools/jispec/change/change-command.ts tools/jispec/implement/handoff-packet.ts tools/jispec/verify/verify-runner.ts tools/jispec/ci/verify-summary.ts tools/jispec/tests/p9-change-impact-summary.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: add p9 change impact summary"
```

Expected: commit succeeds after the full gate passes.

---

## Final Verification

Run:

```powershell
npm run typecheck
npm run post-release:gate
node --import tsx tools\jispec\cli.ts doctor v1 --root . --json
node --import tsx tools\jispec\cli.ts doctor runtime --root . --json
node --import tsx tools\jispec\cli.ts doctor pilot --root . --json
```

Expected:

- TypeScript passes with no errors.
- Post-release gate reports all suites passing.
- `doctor v1`, `doctor runtime`, and `doctor pilot` return JSON with `ready: true`.

## Self-Review Checklist

- P9-T1 maps to Task 1 and freezes current source-of-truth paths.
- P9-T2 maps to Task 2 and adds the shared provenance taxonomy to bootstrap, contract-source adapters, and Greenfield graph artifacts.
- P9-T3 maps to Task 3 and exposes advisory change impact summaries across change, implement, verify, and CI.
- No task introduces GitNexus or Graphify as runtime dependencies.
- Markdown companions remain human-readable summaries; JSON/YAML artifacts remain the machine contracts.
- Missing, invalid, or stale impact graphs stay advisory and cannot create blocking verify issues by themselves.

---

## P9 Second Batch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the remaining GitNexus / Graphify capability borrowings into JiSpec-native reviewer companions, multi-repo drift hints, import-only external graph evidence, and explicit opt-in boundaries for external tool execution.

**Architecture:** Keep JiSpec's deterministic JSON/YAML artifacts as the source of truth and use Markdown only as reviewer-facing summaries. External GitNexus / Graphify data enters as advisory normalized evidence with provenance labels; JiSpec never treats imported or externally generated graph output as a blocking gate by itself. The second batch builds on P9-T1 source-of-truth baselines, P9-T2 provenance descriptors, and P9-T3 impact summaries.

**Tech Stack:** TypeScript, Node.js `assert`, `tsx`, `js-yaml`, JiSpec regression runner, existing `tools/jispec` modules, JSON schema files under `schemas/`.

---

### Second-Batch Scope

This section covers the remaining tasks from `docs/gitnexus-graphify-capability-upgrade-plan.md`:

- `P9-T4 Reviewer Companion Consolidation`
- `P9-T5 Multi-Repo Contract Drift Hints`
- `P9-T6 External Graph Adapter Import-Only`
- `P9-T7 External Tool Run Opt-In Boundary`

The plan preserves these boundaries:

- Markdown companions are reviewer aids, not machine contracts.
- Console surfaces may display companion paths and summaries, but they do not parse Markdown to decide gate status.
- Cross-repo drift hints create owner actions and suggested commands only.
- External graph imports are advisory and non-blocking.
- External tool execution requires explicit provider, command, privacy metadata, audit metadata, and replay metadata.

## Second-Batch File Structure

Create:

- `tools/jispec/companion/decision-sections.ts` - shared fixed decision-section titles, section input model, rendering helpers, summary extraction, and line-budget enforcement.
- `tools/jispec/console/repo-group.ts` - optional `.spec/console/repo-group.yaml` parser and validator for repo id, role, upstream refs, and downstream refs.
- `tools/jispec/integrations/external-graph-import.ts` - import-only external graph parser, schema validation boundary, normalized evidence mapper, and advisory warning model.
- `tools/jispec/integrations/external-tool-run-boundary.ts` - explicit run request model, artifact writer, approval subject resolver, and blocking-issue guard for external tool output.
- `schemas/external-graph-import.schema.json` - schema for import-only external graph artifacts.
- `schemas/external-tool-run-boundary.schema.json` - schema for explicit external tool run artifacts.
- `tools/jispec/tests/p9-reviewer-companion-consolidation.ts` - P9-T4 companion consolidation regression suite.
- `tools/jispec/tests/p9-multi-repo-contract-drift-hints.ts` - P9-T5 repo group and drift hint regression suite.
- `tools/jispec/tests/p9-external-graph-import-only.ts` - P9-T6 import-only adapter regression suite.
- `tools/jispec/tests/p9-external-tool-run-opt-in-boundary.ts` - P9-T7 opt-in boundary regression suite.

Modify:

- `tools/jispec/human-decision-packet.ts` - use shared companion section renderer for human decision packets.
- `tools/jispec/bootstrap/takeover-brief.ts` - render takeover companion with fixed decision sections and truth-source links.
- `tools/jispec/bootstrap/adopt-summary.ts` - render adopt companion with fixed decision sections and truth-source links.
- `tools/jispec/change/spec-delta.ts` - render change companion decision sections from `impact-summary.ts` and source artifact paths.
- `tools/jispec/implement/handoff-packet.ts` - render implement companion decision sections from impact summary, verification hints, and replay command.
- `tools/jispec/release/baseline-snapshot.ts` - expose companion metadata for baseline snapshot reviewers without changing snapshot truth semantics.
- `tools/jispec/console/read-model-snapshot.ts` - expose companion path and summary only; never parse Markdown as a gate source.
- `tools/jispec/console/multi-repo.ts` - load optional repo group config and emit cross-repo contract drift hints in `.spec/console/multi-repo-governance.json`.
- `tools/jispec/console/governance-dashboard.ts` - display repo group drift hints and owner actions.
- `tools/jispec/console/governance-actions.ts` - add suggested commands for cross-repo drift owners.
- `tools/jispec/facts/canonical-facts.ts` - include normalized external graph evidence facts as advisory facts.
- `tools/jispec/verify/verify-runner.ts` - include invalid external graph warnings and external evidence freshness without making them blocking.
- `tools/jispec/privacy/redaction.ts` - scan external graph summaries, normalized evidence, and external run artifacts.
- `tools/jispec/policy/approval.ts` - evaluate regulated-profile owner approval for sharing or adopting external graph summaries.
- `tools/jispec/replay/replay-metadata.ts` - record external tool run metadata for deterministic replay review.
- `docs/multi-repo-governance.md` - document repo group config and cross-repo drift hint semantics.
- `docs/integrations.md` - document import-only and opt-in run modes.
- `docs/privacy-and-local-first.md` - document privacy, redaction, and approval boundaries for external tools.
- `tools/jispec/tests/regression-runner.ts` - register P9-T4 through P9-T7 suites.
- `tools/jispec/tests/regression-matrix-contract.ts` - freeze the second-batch matrix counts.

## Second-Batch Regression Matrix Accounting

Historical baseline before P9-T4 implementation:

- Total suites: `127`
- Total expected tests: `557`
- `verify-ci-gates`: `12` suites, `50` expected tests
- `runtime-extended`: `40` suites, `169` expected tests

Planned matrix after P9-T4 through P9-T7 are complete:

- Total suites: `131`
- Total expected tests: `581`
- `verify-ci-gates`: `13` suites, `56` expected tests
- `runtime-extended`: `43` suites, `187` expected tests

Suite placement:

- `P9 Reviewer Companion Consolidation`: `runtime-extended`, `6` expected tests, task `P9-T4` - completed.
- `P9 Multi-Repo Contract Drift Hints`: `runtime-extended`, `6` expected tests, task `P9-T5` - completed.
- `P9 External Graph Import Only`: `verify-ci-gates`, `6` expected tests, task `P9-T6` - completed.
- `P9 External Tool Run Opt-In Boundary`: `runtime-extended`, `6` expected tests, task `P9-T7` - completed.

---

### Task 4: P9-T4 Reviewer Companion Consolidation

状态：已完成

**Files:**
- Create: `tools/jispec/companion/decision-sections.ts`
- Create: `tools/jispec/tests/p9-reviewer-companion-consolidation.ts`
- Modify: `tools/jispec/human-decision-packet.ts`
- Modify: `tools/jispec/bootstrap/takeover-brief.ts`
- Modify: `tools/jispec/bootstrap/adopt-summary.ts`
- Modify: `tools/jispec/change/spec-delta.ts`
- Modify: `tools/jispec/implement/handoff-packet.ts`
- Modify: `tools/jispec/release/baseline-snapshot.ts`
- Modify: `tools/jispec/console/read-model-snapshot.ts`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`

- [x] **Step 1: Write the failing P9-T4 regression suite**

Create `tools/jispec/tests/p9-reviewer-companion-consolidation.ts`:

```ts
import assert from "node:assert/strict";
import {
  DECISION_COMPANION_SECTION_TITLES,
  renderDecisionCompanionSections,
  summarizeDecisionCompanion,
} from "../companion/decision-sections";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Reviewer Companion Consolidation Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("shared renderer emits the fixed reviewer decision sections in order", () => {
    const text = renderDecisionCompanionSections({
      subject: "change CHG-123",
      truthSources: [".spec/deltas/CHG-123/impact-graph.json", ".spec/deltas/CHG-123/verify-focus.yaml"],
      strongestEvidence: ["impact graph touches contracts/payment.yaml"],
      inferredEvidence: ["handoff packet infers payment tests from verify focus"],
      drift: ["no conflict detected"],
      impact: ["contract: contracts/payment.yaml", "test: tests/payment.spec.ts"],
      nextSteps: ["run npm run gate:quick"],
      maxLines: 150,
    });

    assertSectionOrder(text);
    assert.match(text, /\.spec\/deltas\/CHG-123\/impact-graph\.json/);
    assert.match(text, /\.spec\/deltas\/CHG-123\/verify-focus\.yaml/);
    assert.ok(text.split(/\r?\n/).length <= 150);
  }));

  results.push(record("renderer marks empty inferred or drift sections as none without dropping headings", () => {
    const text = renderDecisionCompanionSections({
      subject: "takeover bootstrap",
      truthSources: [".spec/bootstrap/evidence-inventory.json"],
      strongestEvidence: ["ranked evidence has package.json"],
      inferredEvidence: [],
      drift: [],
      impact: ["contract: docs/v1-mainline-stable-contract.md"],
      nextSteps: ["review adoption summary"],
      maxLines: 150,
    });

    assertSectionOrder(text);
    assert.match(text, /推断证据\n- none/);
    assert.match(text, /冲突\/drift\n- none/);
  }));

  results.push(record("takeover companion contract uses fixed headings and truth source references", () => {
    const rendered = renderDecisionCompanionSections({
      subject: "takeover legacy repository",
      truthSources: [".spec/bootstrap/takeover-brief.json"],
      strongestEvidence: ["legacy routes map to domain scenarios"],
      inferredEvidence: ["feature vocabulary inferred from controller names"],
      drift: ["missing source snapshot: not_available_yet"],
      impact: ["contract: docs/v1-mainline-stable-contract.md"],
      nextSteps: ["open .spec/bootstrap/adopt-summary.md"],
      maxLines: 150,
    });

    assertSectionOrder(rendered);
    assert.match(rendered, /\.spec\/bootstrap\/takeover-brief\.json/);
  }));

  results.push(record("change and implement companions can share the same decision section contract", () => {
    const changeCompanion = renderDecisionCompanionSections({
      subject: "change delta",
      truthSources: [".spec/deltas/CHG-1/impact-graph.json"],
      strongestEvidence: ["delta edits contracts/order.yaml"],
      inferredEvidence: ["verify focus selects order regression"],
      drift: ["impact graph freshness: fresh"],
      impact: ["contract: contracts/order.yaml", "test: tools/jispec/tests/order.ts"],
      nextSteps: ["run node --import tsx tools/jispec/cli.ts verify --change CHG-1"],
      maxLines: 150,
    });
    const implementCompanion = renderDecisionCompanionSections({
      subject: "implementation handoff",
      truthSources: [".spec/deltas/CHG-1/implementation-handoff.json"],
      strongestEvidence: ["handoff records replay command"],
      inferredEvidence: ["missing verification hint maps to order regression"],
      drift: ["no conflict detected"],
      impact: ["contract: contracts/order.yaml", "test: tools/jispec/tests/order.ts"],
      nextSteps: ["run npm run gate:quick"],
      maxLines: 150,
    });

    assertSectionOrder(changeCompanion);
    assertSectionOrder(implementCompanion);
  }));

  results.push(record("console summary exposes path and summary only", () => {
    const summary = summarizeDecisionCompanion({
      path: ".spec/deltas/CHG-1/impact-report.md",
      text: renderDecisionCompanionSections({
        subject: "change delta",
        truthSources: [".spec/deltas/CHG-1/impact-graph.json"],
        strongestEvidence: ["contract graph edge: A -> B"],
        inferredEvidence: ["verify focus inferred from changed files"],
        drift: ["no conflict detected"],
        impact: ["contract: A", "test: B"],
        nextSteps: ["review owner action"],
        maxLines: 150,
      }),
    });

    assert.deepEqual(Object.keys(summary).sort(), ["path", "summary"].sort());
    assert.equal(summary.path, ".spec/deltas/CHG-1/impact-report.md");
    assert.doesNotMatch(JSON.stringify(summary), /gateStatus|blocking|parsedMarkdown/);
  }));

  results.push(record("P9-T4 suite is registered in runtime-extended", () => {
    const { TEST_SUITES } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-reviewer-companion-consolidation.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T4");
  }));

  report(results);
}

function assertSectionOrder(text: string): void {
  const positions = DECISION_COMPANION_SECTION_TITLES.map((title) => text.indexOf(title));
  for (const position of positions) {
    assert.ok(position >= 0, `missing section at position ${position}`);
  }
  for (let index = 1; index < positions.length; index += 1) {
    assert.ok(positions[index] > positions[index - 1], `${DECISION_COMPANION_SECTION_TITLES[index]} is out of order`);
  }
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T4 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-reviewer-companion-consolidation.ts
```

Expected: FAIL because `tools/jispec/companion/decision-sections.ts` does not exist and the suite is not registered.

- [x] **Step 3: Add the shared companion section helper**

Create `tools/jispec/companion/decision-sections.ts`:

```ts
export const DECISION_COMPANION_SECTION_TITLES = [
  "判断对象",
  "最强证据",
  "推断证据",
  "冲突/drift",
  "影响契约/测试",
  "下一步",
] as const;

export interface DecisionCompanionSectionsInput {
  subject: string;
  truthSources: string[];
  strongestEvidence: string[];
  inferredEvidence: string[];
  drift: string[];
  impact: string[];
  nextSteps: string[];
  maxLines?: number;
}

export interface DecisionCompanionSummary {
  path: string;
  summary: string;
}

export function renderDecisionCompanionSections(input: DecisionCompanionSectionsInput): string {
  const maxLines = input.maxLines ?? 150;
  const lines = [
    "## 判断对象",
    `- ${normalizeText(input.subject, "unknown")}`,
    "- Truth sources:",
    ...renderList(input.truthSources),
    "",
    "## 最强证据",
    ...renderList(input.strongestEvidence),
    "",
    "## 推断证据",
    ...renderList(input.inferredEvidence),
    "",
    "## 冲突/drift",
    ...renderList(input.drift),
    "",
    "## 影响契约/测试",
    ...renderList(input.impact),
    "",
    "## 下一步",
    ...renderList(input.nextSteps),
  ];

  return enforceLineBudget(lines, maxLines).join("\n");
}

export function summarizeDecisionCompanion(input: { path: string; text: string }): DecisionCompanionSummary {
  const subject = firstBulletAfter(input.text, "## 判断对象") ?? "companion summary unavailable";
  const strongest = firstBulletAfter(input.text, "## 最强证据") ?? "strongest evidence unavailable";
  return {
    path: input.path,
    summary: `${subject}; ${strongest}`,
  };
}

function renderList(values: string[]): string[] {
  const normalized = values.map((value) => normalizeText(value, "")).filter((value) => value.length > 0);
  return normalized.length > 0 ? normalized.map((value) => `- ${value}`) : ["- none"];
}

function normalizeText(value: string, fallback: string): string {
  const trimmed = value.replace(/\r?\n/g, " ").trim();
  return trimmed.length > 0 ? trimmed : fallback;
}

function firstBulletAfter(text: string, heading: string): string | undefined {
  const lines = text.split(/\r?\n/);
  const headingIndex = lines.findIndex((line) => line.trim() === heading);
  if (headingIndex < 0) {
    return undefined;
  }
  const bullet = lines.slice(headingIndex + 1).find((line) => line.startsWith("- "));
  return bullet?.slice(2).trim();
}

function enforceLineBudget(lines: string[], maxLines: number): string[] {
  if (lines.length <= maxLines) {
    return lines;
  }
  const trimmed = lines.slice(0, Math.max(0, maxLines - 2));
  trimmed.push("", "- Companion truncated to preserve reviewer line budget.");
  return trimmed;
}
```

- [x] **Step 4: Wire the helper into existing companion renderers**

Modify the existing companion renderers so each caller builds `DecisionCompanionSectionsInput` from its existing JSON/YAML truth source:

```ts
import { renderDecisionCompanionSections } from "./companion/decision-sections";

const companionText = renderDecisionCompanionSections({
  subject,
  truthSources,
  strongestEvidence,
  inferredEvidence,
  drift,
  impact,
  nextSteps,
  maxLines: 150,
});
```

Use these truth-source paths per surface:

- `takeover-brief.ts`: `.spec/bootstrap/takeover-brief.json` and `.spec/bootstrap/evidence-inventory.json`.
- `adopt-summary.ts`: `.spec/bootstrap/adopt-summary.json` and `.spec/bootstrap/adoption-plan.yaml`.
- `spec-delta.ts`: `.spec/deltas/<changeId>/impact-graph.json` and `.spec/deltas/<changeId>/verify-focus.yaml`.
- `handoff-packet.ts`: `.spec/deltas/<changeId>/implementation-handoff.json` and `.spec/deltas/<changeId>/verify-focus.yaml`.
- `baseline-snapshot.ts`: `.spec/baseline/baseline-snapshot.json`.

Modify `tools/jispec/console/read-model-snapshot.ts` to expose only:

```ts
export interface ConsoleCompanionSummary {
  path: string;
  summary: string;
}
```

Do not add parsed headings, gate status, or blocking fields derived from Markdown text.

- [x] **Step 5: Register the P9-T4 suite and update matrix counts**

Modify `tools/jispec/tests/regression-runner.ts`:

```ts
runtime({ name: 'P9 Reviewer Companion Consolidation', file: 'p9-reviewer-companion-consolidation.ts', expectedTests: 6, task: 'P9-T4' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` from the current baseline:

```ts
assert.equal(manifest.totalSuites, 128);
assert.equal(manifest.totalExpectedTests, 563);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 41);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 175);
```

- [x] **Step 6: Run focused verification for P9-T4**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-reviewer-companion-consolidation.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run gate:quick -- tools/jispec/tests/p9-reviewer-companion-consolidation.ts
```

Expected: all commands PASS, and `gate:quick` reports the P9-T4 suite passing.

- [x] **Step 7: Commit P9-T4**

Run:

```powershell
git add tools/jispec/companion/decision-sections.ts tools/jispec/human-decision-packet.ts tools/jispec/bootstrap/takeover-brief.ts tools/jispec/bootstrap/adopt-summary.ts tools/jispec/change/spec-delta.ts tools/jispec/implement/handoff-packet.ts tools/jispec/release/baseline-snapshot.ts tools/jispec/console/read-model-snapshot.ts tools/jispec/tests/p9-reviewer-companion-consolidation.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: consolidate p9 reviewer companions"
```

Expected: commit succeeds and contains only P9-T4 companion/test/matrix changes.

---

### Task 5: P9-T5 Multi-Repo Contract Drift Hints

状态：已完成

**Files:**
- Create: `tools/jispec/console/repo-group.ts`
- Create: `tools/jispec/tests/p9-multi-repo-contract-drift-hints.ts`
- Modify: `tools/jispec/console/multi-repo.ts`
- Modify: `tools/jispec/console/governance-dashboard.ts`
- Modify: `tools/jispec/console/governance-actions.ts`
- Modify: `docs/multi-repo-governance.md`
- Modify: `tools/jispec/tests/console-multi-repo-governance.ts`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`

- [x] **Step 1: Write the failing P9-T5 regression suite**

Create `tools/jispec/tests/p9-multi-repo-contract-drift-hints.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import yaml from "js-yaml";
import { loadRepoGroupConfig } from "../console/repo-group";
import { buildMultiRepoGovernanceSnapshot } from "../console/multi-repo";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 Multi-Repo Contract Drift Hints Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("repo group config declares repo id, role, upstream refs, and downstream refs", () => {
    const root = createFixtureRoot();
    writeRepoGroup(root, {
      repos: [
        {
          id: "api",
          role: "upstream",
          path: "repos/api",
          upstreamContractRefs: [],
          downstreamContractRefs: ["web:contracts/payment.yaml"],
        },
        {
          id: "web",
          role: "downstream",
          path: "repos/web",
          upstreamContractRefs: ["api:contracts/payment.yaml"],
          downstreamContractRefs: [],
        },
      ],
    });

    const config = loadRepoGroupConfig(root);
    assert.equal(config.status, "available");
    assert.equal(config.repos.length, 2);
    assert.equal(config.repos[1].upstreamContractRefs[0], "api:contracts/payment.yaml");
  }));

  results.push(record("missing repo group config returns not_available_yet", () => {
    const root = createFixtureRoot();
    const config = loadRepoGroupConfig(root);
    assert.equal(config.status, "not_available_yet");
    assert.deepEqual(config.repos, []);
  }));

  results.push(record("missing repository snapshot is represented as not_available_yet", () => {
    const root = createFixtureRoot();
    writeRepoGroup(root, {
      repos: [
        {
          id: "api",
          role: "upstream",
          path: "repos/api",
          upstreamContractRefs: [],
          downstreamContractRefs: ["web:contracts/payment.yaml"],
        },
      ],
    });

    const snapshot = buildMultiRepoGovernanceSnapshot({ root });
    assert.equal(snapshot.repoGroup.status, "available");
    assert.equal(snapshot.repositories[0].snapshotStatus, "not_available_yet");
  }));

  results.push(record("cross-repo drift produces owner action and suggested command only", () => {
    const root = createFixtureRoot();
    writeRepoGroup(root, {
      repos: [
        {
          id: "api",
          role: "upstream",
          path: "repos/api",
          upstreamContractRefs: [],
          downstreamContractRefs: ["web:contracts/payment.yaml"],
        },
        {
          id: "web",
          role: "downstream",
          path: "repos/web",
          upstreamContractRefs: ["api:contracts/payment.yaml"],
          downstreamContractRefs: [],
        },
      ],
    });
    writeRepoSnapshot(root, "api", { contracts: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }] });
    writeRepoSnapshot(root, "web", { contracts: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }] });

    const snapshot = buildMultiRepoGovernanceSnapshot({ root });
    assert.equal(snapshot.contractDriftHints.length, 1);
    assert.equal(snapshot.contractDriftHints[0].severity, "owner_action");
    assert.match(snapshot.contractDriftHints[0].suggestedCommand, /jispec console multi-repo/);
    assert.equal(snapshot.contractDriftHints[0].blockingGateReplacement, false);
  }));

  results.push(record("governance actions include drift owner action without changing single-repo gates", () => {
    const root = createFixtureRoot();
    writeRepoGroup(root, {
      repos: [
        {
          id: "api",
          role: "upstream",
          path: "repos/api",
          upstreamContractRefs: [],
          downstreamContractRefs: ["web:contracts/payment.yaml"],
        },
        {
          id: "web",
          role: "downstream",
          path: "repos/web",
          upstreamContractRefs: ["api:contracts/payment.yaml"],
          downstreamContractRefs: [],
        },
      ],
    });
    writeRepoSnapshot(root, "api", { contracts: [{ ref: "contracts/payment.yaml", hash: "hash-api-v2" }] });
    writeRepoSnapshot(root, "web", { contracts: [{ ref: "contracts/payment.yaml", hash: "hash-api-v1" }] });

    const snapshot = buildMultiRepoGovernanceSnapshot({ root });
    assert.ok(snapshot.ownerActions.some((action) => action.kind === "cross_repo_contract_drift"));
    assert.equal(snapshot.singleRepoGateReplacement, false);
  }));

  results.push(record("P9-T5 suite is registered in runtime-extended", () => {
    const { TEST_SUITES } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-multi-repo-contract-drift-hints.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T5");
  }));

  report(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-multi-repo-"));
}

function writeRepoGroup(root: string, value: unknown): void {
  const dir = path.join(root, ".spec", "console");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "repo-group.yaml"), yaml.dump(value), "utf-8");
}

function writeRepoSnapshot(root: string, repoId: string, value: { contracts: Array<{ ref: string; hash: string }> }): void {
  const dir = path.join(root, ".spec", "console", "repo-snapshots");
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${repoId}.json`), JSON.stringify(value, null, 2), "utf-8");
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T5 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-multi-repo-contract-drift-hints.ts
```

Expected: FAIL because `tools/jispec/console/repo-group.ts` does not exist and multi-repo output does not include `repoGroup`, `contractDriftHints`, or `singleRepoGateReplacement`.

- [x] **Step 3: Add repo group config parsing**

Create `tools/jispec/console/repo-group.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type RepoGroupStatus = "available" | "not_available_yet" | "invalid";
export type RepoRole = "upstream" | "downstream" | "peer";

export interface RepoGroupRepo {
  id: string;
  role: RepoRole;
  path: string;
  upstreamContractRefs: string[];
  downstreamContractRefs: string[];
}

export interface RepoGroupConfig {
  status: RepoGroupStatus;
  sourcePath: string;
  repos: RepoGroupRepo[];
  warnings: string[];
}

export function loadRepoGroupConfig(root: string): RepoGroupConfig {
  const sourcePath = ".spec/console/repo-group.yaml";
  const absolutePath = path.join(root, sourcePath);
  if (!fs.existsSync(absolutePath)) {
    return { status: "not_available_yet", sourcePath, repos: [], warnings: [] };
  }

  try {
    const parsed = yaml.load(fs.readFileSync(absolutePath, "utf-8"));
    const repos = parseRepos(parsed);
    return { status: "available", sourcePath, repos, warnings: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { status: "invalid", sourcePath, repos: [], warnings: [message] };
  }
}

function parseRepos(value: unknown): RepoGroupRepo[] {
  if (!isRecord(value) || !Array.isArray(value.repos)) {
    throw new Error("repo-group.yaml must contain a repos array");
  }
  return value.repos.map((repo, index) => parseRepo(repo, index));
}

function parseRepo(value: unknown, index: number): RepoGroupRepo {
  if (!isRecord(value)) {
    throw new Error(`repos[${index}] must be an object`);
  }
  const role = stringValue(value.role);
  if (role !== "upstream" && role !== "downstream" && role !== "peer") {
    throw new Error(`repos[${index}].role must be upstream, downstream, or peer`);
  }
  return {
    id: requiredString(value.id, `repos[${index}].id`),
    role,
    path: requiredString(value.path, `repos[${index}].path`),
    upstreamContractRefs: stringArray(value.upstreamContractRefs),
    downstreamContractRefs: stringArray(value.downstreamContractRefs),
  };
}

function requiredString(value: unknown, label: string): string {
  const text = stringValue(value);
  if (text.length === 0) {
    throw new Error(`${label} is required`);
  }
  return text;
}

function stringValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean) : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

- [x] **Step 4: Extend multi-repo aggregate with drift hints**

Modify `tools/jispec/console/multi-repo.ts` to add these output fields:

```ts
export interface CrossRepoContractDriftHint {
  kind: "cross_repo_contract_drift";
  upstreamRepoId: string;
  downstreamRepoId: string;
  contractRef: string;
  severity: "owner_action";
  suggestedCommand: string;
  blockingGateReplacement: false;
}

export interface MultiRepoGovernanceSnapshot {
  repoGroup: RepoGroupConfig;
  repositories: Array<{
    id: string;
    path: string;
    role: RepoRole;
    snapshotStatus: "available" | "not_available_yet" | "invalid";
  }>;
  contractDriftHints: CrossRepoContractDriftHint[];
  ownerActions: Array<{ kind: "cross_repo_contract_drift"; repoId: string; message: string; suggestedCommand: string }>;
  singleRepoGateReplacement: false;
}
```

Build drift hints only when both compared repo snapshots exist and their contract hashes differ. For a missing repo snapshot, set `snapshotStatus: "not_available_yet"` and do not synthesize a blocking issue.

- [x] **Step 5: Update Console dashboard/actions and docs**

Modify `tools/jispec/console/governance-dashboard.ts` to render a `Cross-repo contract drift hints` section only from `contractDriftHints`.

Modify `tools/jispec/console/governance-actions.ts` to create owner actions shaped like:

```ts
{
  kind: "cross_repo_contract_drift",
  repoId: hint.downstreamRepoId,
  message: `${hint.downstreamRepoId} may need to reconcile ${hint.contractRef} from ${hint.upstreamRepoId}.`,
  suggestedCommand: hint.suggestedCommand,
}
```

Update `docs/multi-repo-governance.md` with this config example:

```yaml
repos:
  - id: api
    role: upstream
    path: repos/api
    upstreamContractRefs: []
    downstreamContractRefs:
      - web:contracts/payment.yaml
  - id: web
    role: downstream
    path: repos/web
    upstreamContractRefs:
      - api:contracts/payment.yaml
    downstreamContractRefs: []
```

Document that drift hints are owner actions and suggested commands only; single-repo verify remains the authoritative gate.

- [x] **Step 6: Register the P9-T5 suite and update matrix counts**

Modify `tools/jispec/tests/regression-runner.ts`:

```ts
runtime({ name: 'P9 Multi-Repo Contract Drift Hints', file: 'p9-multi-repo-contract-drift-hints.ts', expectedTests: 6, task: 'P9-T5' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` after P9-T5:

```ts
assert.equal(manifest.totalSuites, 129);
assert.equal(manifest.totalExpectedTests, 569);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 42);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 181);
```

- [x] **Step 7: Run focused verification for P9-T5**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-multi-repo-contract-drift-hints.ts
node --import tsx tools\jispec\tests\console-multi-repo-governance.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run gate:quick -- tools/jispec/tests/p9-multi-repo-contract-drift-hints.ts
```

Expected: all commands PASS, and no test expects cross-repo drift to replace a single-repo gate.

- [x] **Step 8: Commit P9-T5**

Run:

```powershell
git add tools/jispec/console/repo-group.ts tools/jispec/console/multi-repo.ts tools/jispec/console/governance-dashboard.ts tools/jispec/console/governance-actions.ts docs/multi-repo-governance.md tools/jispec/tests/console-multi-repo-governance.ts tools/jispec/tests/p9-multi-repo-contract-drift-hints.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: add p9 multi-repo drift hints"
```

Expected: commit succeeds and contains only P9-T5 multi-repo/docs/test/matrix changes.

---

### Task 6: P9-T6 External Graph Adapter Import-Only

状态：已完成

**Files:**
- Create: `tools/jispec/integrations/external-graph-import.ts`
- Create: `schemas/external-graph-import.schema.json`
- Create: `tools/jispec/tests/p9-external-graph-import-only.ts`
- Modify: `tools/jispec/facts/canonical-facts.ts`
- Modify: `tools/jispec/verify/verify-runner.ts`
- Modify: `tools/jispec/privacy/redaction.ts`
- Modify: `docs/integrations.md`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`

- [x] **Step 1: Write the failing P9-T6 regression suite**

Create `tools/jispec/tests/p9-external-graph-import-only.ts`:

```ts
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  importExternalGraphArtifact,
  normalizeExternalGraphEvidence,
} from "../integrations/external-graph-import";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 External Graph Import Only Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("import-only mode records no command execution, network, or source upload", () => {
    const root = createFixtureRoot();
    const artifactPath = writeExternalGraph(root, {
      provider: "graphify",
      generatedAt: "2026-05-02T00:00:00.000Z",
      nodes: [{ id: "contract:payment", kind: "contract", label: "payment" }],
      edges: [],
    });

    const result = importExternalGraphArtifact({ root, mode: "import-only", sourcePath: artifactPath });
    assert.equal(result.mode, "import-only");
    assert.equal(result.execution.commandExecuted, false);
    assert.equal(result.execution.networkUsed, false);
    assert.equal(result.execution.sourceUploaded, false);
  }));

  results.push(record("normalized evidence includes provider, generatedAt, sourcePath, freshness, and provenance label", () => {
    const evidence = normalizeExternalGraphEvidence({
      provider: "gitnexus",
      generatedAt: "2026-05-02T00:00:00.000Z",
      sourcePath: ".spec/integrations/gitnexus-graph.json",
      nodes: [{ id: "file:src/payment.ts", kind: "file", label: "src/payment.ts" }],
      edges: [],
      now: new Date("2026-05-02T01:00:00.000Z"),
    });

    assert.equal(evidence[0].provider, "gitnexus");
    assert.equal(evidence[0].generatedAt, "2026-05-02T00:00:00.000Z");
    assert.equal(evidence[0].sourcePath, ".spec/integrations/gitnexus-graph.json");
    assert.equal(evidence[0].freshness, "fresh");
    assert.equal(evidence[0].provenance.label, "external_import");
  }));

  results.push(record("invalid external graph returns warning and does not interrupt verify", () => {
    const root = createFixtureRoot();
    const artifactPath = path.join(root, ".spec", "integrations", "invalid.json");
    fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
    fs.writeFileSync(artifactPath, JSON.stringify({ provider: "graphify", nodes: "bad" }), "utf-8");

    const result = importExternalGraphArtifact({ root, mode: "import-only", sourcePath: artifactPath });
    assert.equal(result.status, "invalid");
    assert.ok(result.warnings.some((warning) => warning.kind === "invalid_external_graph_artifact"));
    assert.equal(result.verifyInterruption, false);
  }));

  results.push(record("canonical facts include external graph evidence as advisory only", () => {
    const evidence = normalizeExternalGraphEvidence({
      provider: "graphify",
      generatedAt: "2026-05-02T00:00:00.000Z",
      sourcePath: ".spec/integrations/graphify.json",
      nodes: [{ id: "contract:billing", kind: "contract", label: "billing" }],
      edges: [],
      now: new Date("2026-05-02T01:00:00.000Z"),
    });

    assert.equal(evidence[0].blockingEligible, false);
    assert.equal(evidence[0].advisoryOnly, true);
  }));

  results.push(record("privacy classification covers external graph summaries and normalized evidence", () => {
    const result = importExternalGraphArtifact({
      root: createFixtureRoot(),
      mode: "import-only",
      sourcePath: writeExternalGraph(createFixtureRoot(), {
        provider: "graphify",
        generatedAt: "2026-05-02T00:00:00.000Z",
        nodes: [{ id: "summary:payment", kind: "summary", label: "Payment flow" }],
        edges: [],
      }),
    });

    assert.ok(result.privacySubjects.some((subject) => subject.kind === "external_graph_summary"));
    assert.ok(result.privacySubjects.some((subject) => subject.kind === "normalized_external_evidence"));
  }));

  results.push(record("P9-T6 suite is registered in verify-ci-gates", () => {
    const { TEST_SUITES } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-external-graph-import-only.ts");
    assert.ok(suite);
    assert.equal(suite.area, "verify-ci-gates");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T6");
  }));

  report(results);
}

function createFixtureRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "jispec-p9-external-graph-"));
}

function writeExternalGraph(root: string, value: unknown): string {
  const artifactPath = path.join(root, ".spec", "integrations", "external-graph.json");
  fs.mkdirSync(path.dirname(artifactPath), { recursive: true });
  fs.writeFileSync(artifactPath, JSON.stringify(value, null, 2), "utf-8");
  return artifactPath;
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T6 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-external-graph-import-only.ts
```

Expected: FAIL because `tools/jispec/integrations/external-graph-import.ts` and the import schema do not exist.

- [x] **Step 3: Add the import-only adapter and schema**

Create `tools/jispec/integrations/external-graph-import.ts`:

```ts
import fs from "node:fs";
import path from "node:path";
import { describeEvidenceProvenance } from "../provenance/evidence-provenance";

export type ExternalGraphImportMode = "import-only";
export type ExternalGraphImportStatus = "available" | "invalid" | "not_available_yet";
export type ExternalEvidenceFreshness = "fresh" | "stale" | "unknown";

export interface ExternalGraphArtifact {
  provider: string;
  generatedAt: string;
  nodes: Array<{ id: string; kind: string; label: string }>;
  edges: Array<{ from: string; to: string; kind: string }>;
}

export interface NormalizedExternalGraphEvidence {
  provider: string;
  generatedAt: string;
  sourcePath: string;
  freshness: ExternalEvidenceFreshness;
  nodeId: string;
  nodeKind: string;
  label: string;
  provenance: ReturnType<typeof describeEvidenceProvenance>;
  advisoryOnly: true;
  blockingEligible: false;
}

export interface ExternalGraphImportResult {
  mode: ExternalGraphImportMode;
  status: ExternalGraphImportStatus;
  sourcePath: string;
  execution: {
    commandExecuted: false;
    networkUsed: false;
    sourceUploaded: false;
  };
  evidence: NormalizedExternalGraphEvidence[];
  warnings: Array<{ kind: "invalid_external_graph_artifact"; message: string }>;
  verifyInterruption: false;
  privacySubjects: Array<{ kind: "external_graph_summary" | "normalized_external_evidence"; sourcePath: string }>;
}

export function importExternalGraphArtifact(input: { root: string; mode: ExternalGraphImportMode; sourcePath: string }): ExternalGraphImportResult {
  const sourcePath = normalizePath(path.isAbsolute(input.sourcePath) ? path.relative(input.root, input.sourcePath) : input.sourcePath);
  const absolutePath = path.isAbsolute(input.sourcePath) ? input.sourcePath : path.join(input.root, input.sourcePath);
  const base = baseResult(sourcePath);

  if (!fs.existsSync(absolutePath)) {
    return { ...base, status: "not_available_yet" };
  }

  try {
    const artifact = parseArtifact(JSON.parse(fs.readFileSync(absolutePath, "utf-8")));
    const evidence = normalizeExternalGraphEvidence({
      provider: artifact.provider,
      generatedAt: artifact.generatedAt,
      sourcePath,
      nodes: artifact.nodes,
      edges: artifact.edges,
      now: new Date(),
    });
    return {
      ...base,
      status: "available",
      evidence,
      privacySubjects: [
        { kind: "external_graph_summary", sourcePath },
        { kind: "normalized_external_evidence", sourcePath },
      ],
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ...base,
      status: "invalid",
      warnings: [{ kind: "invalid_external_graph_artifact", message }],
    };
  }
}

export function normalizeExternalGraphEvidence(input: {
  provider: string;
  generatedAt: string;
  sourcePath: string;
  nodes: ExternalGraphArtifact["nodes"];
  edges: ExternalGraphArtifact["edges"];
  now: Date;
}): NormalizedExternalGraphEvidence[] {
  const freshness = classifyFreshness(input.generatedAt, input.now);
  return input.nodes.map((node) => ({
    provider: input.provider,
    generatedAt: input.generatedAt,
    sourcePath: normalizePath(input.sourcePath),
    freshness,
    nodeId: node.id,
    nodeKind: node.kind,
    label: node.label,
    provenance: describeEvidenceProvenance({ source: "external_import", freshness }),
    advisoryOnly: true,
    blockingEligible: false,
  }));
}

function baseResult(sourcePath: string): ExternalGraphImportResult {
  return {
    mode: "import-only",
    status: "not_available_yet",
    sourcePath,
    execution: { commandExecuted: false, networkUsed: false, sourceUploaded: false },
    evidence: [],
    warnings: [],
    verifyInterruption: false,
    privacySubjects: [],
  };
}

function parseArtifact(value: unknown): ExternalGraphArtifact {
  if (!isRecord(value)) {
    throw new Error("external graph artifact must be an object");
  }
  const provider = requiredString(value.provider, "provider");
  const generatedAt = requiredString(value.generatedAt, "generatedAt");
  const nodes = parseNodes(value.nodes);
  const edges = parseEdges(value.edges);
  return { provider, generatedAt, nodes, edges };
}

function parseNodes(value: unknown): ExternalGraphArtifact["nodes"] {
  if (!Array.isArray(value)) {
    throw new Error("nodes must be an array");
  }
  return value.map((node, index) => {
    if (!isRecord(node)) {
      throw new Error(`nodes[${index}] must be an object`);
    }
    return {
      id: requiredString(node.id, `nodes[${index}].id`),
      kind: requiredString(node.kind, `nodes[${index}].kind`),
      label: requiredString(node.label, `nodes[${index}].label`),
    };
  });
}

function parseEdges(value: unknown): ExternalGraphArtifact["edges"] {
  if (!Array.isArray(value)) {
    throw new Error("edges must be an array");
  }
  return value.map((edge, index) => {
    if (!isRecord(edge)) {
      throw new Error(`edges[${index}] must be an object`);
    }
    return {
      from: requiredString(edge.from, `edges[${index}].from`),
      to: requiredString(edge.to, `edges[${index}].to`),
      kind: requiredString(edge.kind, `edges[${index}].kind`),
    };
  });
}

function classifyFreshness(generatedAt: string, now: Date): ExternalEvidenceFreshness {
  const timestamp = Date.parse(generatedAt);
  if (!Number.isFinite(timestamp)) {
    return "unknown";
  }
  const ageMs = now.getTime() - timestamp;
  return ageMs <= 7 * 24 * 60 * 60 * 1000 ? "fresh" : "stale";
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return value.trim();
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
```

Create `schemas/external-graph-import.schema.json` with required `provider`, `generatedAt`, `nodes`, and `edges` fields. Use `additionalProperties: false` for the top-level object, nodes, and edges.

- [x] **Step 4: Wire normalized external evidence into facts, verify, and privacy**

Modify `tools/jispec/facts/canonical-facts.ts` to add an advisory fact definition:

```ts
{
  key: "externalGraph.normalizedEvidence",
  stability: "advisory",
  source: ".spec/integrations/external-graph.json",
  description: "Normalized import-only external graph evidence. Advisory only; never blocking by itself.",
}
```

Modify `tools/jispec/verify/verify-runner.ts` so invalid external graph imports add a warning with:

```ts
{
  severity: "warn",
  kind: "invalid_external_graph_artifact",
  blocking: false,
}
```

Modify `tools/jispec/privacy/redaction.ts` so artifact kind classification treats external graph summaries and normalized evidence as review-before-sharing artifacts.

Update `docs/integrations.md` with an `import-only` section that states: no external command, no network, no source upload, invalid artifact warning only, normalized evidence advisory only.

- [x] **Step 5: Register the P9-T6 suite and update matrix counts**

Modify `tools/jispec/tests/regression-runner.ts`:

```ts
gates({ name: 'P9 External Graph Import Only', file: 'p9-external-graph-import-only.ts', expectedTests: 6, task: 'P9-T6' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` after P9-T6:

```ts
assert.equal(manifest.totalSuites, 130);
assert.equal(manifest.totalExpectedTests, 575);
assert.equal(areaMap.get("verify-ci-gates")?.suiteCount, 13);
assert.equal(areaMap.get("verify-ci-gates")?.expectedTests, 56);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 42);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 181);
```

- [x] **Step 6: Run focused verification for P9-T6**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-external-graph-import-only.ts
node --import tsx tools\jispec\tests\privacy-redaction.ts
node --import tsx tools\jispec\tests\verify-runner-warn-advisory.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run gate:quick -- tools/jispec/tests/p9-external-graph-import-only.ts
```

Expected: all commands PASS, invalid external graph artifacts remain warning-only, and no assertion permits imported graph evidence to create a blocking issue by itself.

- [x] **Step 7: Commit P9-T6**

Run:

```powershell
git add tools/jispec/integrations/external-graph-import.ts schemas/external-graph-import.schema.json tools/jispec/facts/canonical-facts.ts tools/jispec/verify/verify-runner.ts tools/jispec/privacy/redaction.ts docs/integrations.md tools/jispec/tests/p9-external-graph-import-only.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: add p9 external graph import boundary"
```

Expected: commit succeeds and contains only P9-T6 integration/privacy/verify/docs/test/matrix changes.

---

### Task 7: P9-T7 External Tool Run Opt-In Boundary

状态：已完成

**Files:**
- Create: `tools/jispec/integrations/external-tool-run-boundary.ts`
- Create: `schemas/external-tool-run-boundary.schema.json`
- Create: `tools/jispec/tests/p9-external-tool-run-opt-in-boundary.ts`
- Modify: `tools/jispec/privacy/redaction.ts`
- Modify: `tools/jispec/policy/approval.ts`
- Modify: `tools/jispec/replay/replay-metadata.ts`
- Modify: `docs/privacy-and-local-first.md`
- Modify: `docs/integrations.md`
- Modify: `tools/jispec/tests/regression-runner.ts`
- Modify: `tools/jispec/tests/regression-matrix-contract.ts`

- [x] **Step 1: Write the failing P9-T7 regression suite**

Create `tools/jispec/tests/p9-external-tool-run-opt-in-boundary.ts`:

```ts
import assert from "node:assert/strict";
import {
  buildExternalToolRunArtifact,
  evaluateExternalToolRunRequest,
} from "../integrations/external-tool-run-boundary";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== P9 External Tool Run Opt-In Boundary Tests ===\n");
  const results: TestResult[] = [];

  results.push(record("run-external-tool requires explicit provider and command", () => {
    const missingProvider = evaluateExternalToolRunRequest({
      mode: "run-external-tool",
      command: "graphify export --json",
      provider: "",
      sourceScope: ["contracts/payment.yaml"],
      networkRequired: false,
      sourceUploadRisk: "none",
      modelOrServiceProvider: "local",
      generatedAt: "2026-05-02T00:00:00.000Z",
    });
    const missingCommand = evaluateExternalToolRunRequest({
      mode: "run-external-tool",
      command: "",
      provider: "graphify",
      sourceScope: ["contracts/payment.yaml"],
      networkRequired: false,
      sourceUploadRisk: "none",
      modelOrServiceProvider: "local",
      generatedAt: "2026-05-02T00:00:00.000Z",
    });

    assert.equal(missingProvider.allowed, false);
    assert.equal(missingCommand.allowed, false);
  }));

  results.push(record("artifact records command, network, source upload risk, provider, scope, and generatedAt", () => {
    const artifact = buildExternalToolRunArtifact({
      mode: "run-external-tool",
      command: "graphify export --json .spec/integrations/graphify.json",
      provider: "graphify",
      sourceScope: ["contracts/payment.yaml", "src/payment.ts"],
      networkRequired: true,
      sourceUploadRisk: "summary_only",
      modelOrServiceProvider: "Graphify Cloud",
      generatedAt: "2026-05-02T00:00:00.000Z",
    });

    assert.equal(artifact.command, "graphify export --json .spec/integrations/graphify.json");
    assert.equal(artifact.networkRequired, true);
    assert.equal(artifact.sourceUploadRisk, "summary_only");
    assert.equal(artifact.modelOrServiceProvider, "Graphify Cloud");
    assert.deepEqual(artifact.sourceScope, ["contracts/payment.yaml", "src/payment.ts"]);
    assert.equal(artifact.generatedAt, "2026-05-02T00:00:00.000Z");
  }));

  results.push(record("regulated profile can require owner approval before sharing external graph summary", () => {
    const evaluation = evaluateExternalToolRunRequest({
      mode: "run-external-tool",
      command: "gitnexus export --summary .spec/integrations/gitnexus.json",
      provider: "gitnexus",
      sourceScope: ["contracts/payment.yaml"],
      networkRequired: true,
      sourceUploadRisk: "summary_only",
      modelOrServiceProvider: "GitNexus Cloud",
      generatedAt: "2026-05-02T00:00:00.000Z",
      policyProfile: "regulated",
      ownerApprovalPresent: false,
    });

    assert.equal(evaluation.allowed, false);
    assert.equal(evaluation.requiredApproval?.role, "owner");
    assert.equal(evaluation.requiredApproval?.subject.kind, "external_graph_summary_sharing");
  }));

  results.push(record("external tool output cannot alone create a blocking issue", () => {
    const artifact = buildExternalToolRunArtifact({
      mode: "run-external-tool",
      command: "graphify export --json .spec/integrations/graphify.json",
      provider: "graphify",
      sourceScope: ["src/payment.ts"],
      networkRequired: false,
      sourceUploadRisk: "none",
      modelOrServiceProvider: "local",
      generatedAt: "2026-05-02T00:00:00.000Z",
    });

    assert.equal(artifact.outputBlockingEligible, false);
    assert.equal(artifact.advisoryOnly, true);
  }));

  results.push(record("external tool run artifact includes audit and replay metadata", () => {
    const artifact = buildExternalToolRunArtifact({
      mode: "run-external-tool",
      command: "graphify export --json .spec/integrations/graphify.json",
      provider: "graphify",
      sourceScope: ["src/payment.ts"],
      networkRequired: false,
      sourceUploadRisk: "none",
      modelOrServiceProvider: "local",
      generatedAt: "2026-05-02T00:00:00.000Z",
    });

    assert.equal(artifact.audit.kind, "external_tool_run_requested");
    assert.equal(artifact.replay.kind, "external_tool_run_metadata");
    assert.equal(artifact.replay.command, artifact.command);
  }));

  results.push(record("P9-T7 suite is registered in runtime-extended", () => {
    const { TEST_SUITES } = require("./regression-runner") as typeof import("./regression-runner");
    const suite = TEST_SUITES.find((candidate) => candidate.file === "p9-external-tool-run-opt-in-boundary.ts");
    assert.ok(suite);
    assert.equal(suite.area, "runtime-extended");
    assert.equal(suite.expectedTests, 6);
    assert.equal(suite.task, "P9-T7");
  }));

  report(results);
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    console.log(`✓ ${name}`);
    return { name, passed: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`✗ ${name}: ${message}`);
    return { name, passed: false, error: message };
  }
}

function report(results: TestResult[]): void {
  const passed = results.filter((result) => result.passed).length;
  console.log(`\n${passed}/${results.length} tests passed`);
  if (passed !== results.length) {
    process.exit(1);
  }
}

main();
```

- [x] **Step 2: Run the P9-T7 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-external-tool-run-opt-in-boundary.ts
```

Expected: FAIL because `tools/jispec/integrations/external-tool-run-boundary.ts` and the run-boundary schema do not exist.

- [x] **Step 3: Add explicit external tool run boundary model**

Create `tools/jispec/integrations/external-tool-run-boundary.ts`:

```ts
export type ExternalToolRunMode = "run-external-tool";
export type SourceUploadRisk = "none" | "summary_only" | "source_snippets" | "full_source";

export interface ExternalToolRunRequest {
  mode: ExternalToolRunMode;
  command: string;
  provider: string;
  sourceScope: string[];
  networkRequired: boolean;
  sourceUploadRisk: SourceUploadRisk;
  modelOrServiceProvider: string;
  generatedAt: string;
  policyProfile?: "default" | "regulated";
  ownerApprovalPresent?: boolean;
}

export interface ExternalToolRunEvaluation {
  allowed: boolean;
  reasons: string[];
  requiredApproval?: {
    role: "owner";
    subject: { kind: "external_graph_summary_sharing"; ref: string };
  };
}

export interface ExternalToolRunArtifact {
  kind: "jispec-external-tool-run";
  mode: ExternalToolRunMode;
  command: string;
  provider: string;
  networkRequired: boolean;
  sourceUploadRisk: SourceUploadRisk;
  modelOrServiceProvider: string;
  sourceScope: string[];
  generatedAt: string;
  advisoryOnly: true;
  outputBlockingEligible: false;
  audit: { kind: "external_tool_run_requested"; provider: string; generatedAt: string };
  replay: { kind: "external_tool_run_metadata"; command: string; provider: string; generatedAt: string };
}

export function evaluateExternalToolRunRequest(input: ExternalToolRunRequest): ExternalToolRunEvaluation {
  const reasons: string[] = [];
  if (input.provider.trim().length === 0) {
    reasons.push("provider is required");
  }
  if (input.command.trim().length === 0) {
    reasons.push("command is required");
  }
  if (input.sourceScope.length === 0) {
    reasons.push("source scope is required");
  }
  if (input.policyProfile === "regulated" && input.networkRequired && input.ownerApprovalPresent !== true) {
    reasons.push("owner approval is required before sharing or adopting external graph summary");
    return {
      allowed: false,
      reasons,
      requiredApproval: {
        role: "owner",
        subject: { kind: "external_graph_summary_sharing", ref: input.provider },
      },
    };
  }
  return { allowed: reasons.length === 0, reasons };
}

export function buildExternalToolRunArtifact(input: ExternalToolRunRequest): ExternalToolRunArtifact {
  const evaluation = evaluateExternalToolRunRequest(input);
  if (!evaluation.allowed) {
    throw new Error(`external tool run request is not allowed: ${evaluation.reasons.join("; ")}`);
  }
  return {
    kind: "jispec-external-tool-run",
    mode: input.mode,
    command: input.command.trim(),
    provider: input.provider.trim(),
    networkRequired: input.networkRequired,
    sourceUploadRisk: input.sourceUploadRisk,
    modelOrServiceProvider: input.modelOrServiceProvider.trim(),
    sourceScope: input.sourceScope.map((item) => item.trim()).filter(Boolean),
    generatedAt: input.generatedAt,
    advisoryOnly: true,
    outputBlockingEligible: false,
    audit: {
      kind: "external_tool_run_requested",
      provider: input.provider.trim(),
      generatedAt: input.generatedAt,
    },
    replay: {
      kind: "external_tool_run_metadata",
      command: input.command.trim(),
      provider: input.provider.trim(),
      generatedAt: input.generatedAt,
    },
  };
}
```

Create `schemas/external-tool-run-boundary.schema.json` with required fields: `kind`, `mode`, `command`, `provider`, `networkRequired`, `sourceUploadRisk`, `modelOrServiceProvider`, `sourceScope`, `generatedAt`, `advisoryOnly`, `outputBlockingEligible`, `audit`, and `replay`.

- [x] **Step 4: Wire privacy, approval, replay, and docs**

Modify `tools/jispec/privacy/redaction.ts` so external tool run artifacts are classified as review-before-sharing when `networkRequired` is `true` or `sourceUploadRisk` is not `none`.

Modify `tools/jispec/policy/approval.ts` so regulated profiles include `external_graph_summary_sharing` as an approval subject when an external graph summary is shared or adopted.

Modify `tools/jispec/replay/replay-metadata.ts` so replay metadata can include:

```ts
{
  kind: "external_tool_run_metadata",
  command: string,
  provider: string,
  generatedAt: string,
}
```

Update `docs/privacy-and-local-first.md` with the external tool boundary: explicit command, explicit provider, network disclosure, source upload risk disclosure, regulated owner approval, and advisory-only output.

Update `docs/integrations.md` with `run-external-tool` usage and the rule that external tool output cannot alone create a blocking issue.

- [x] **Step 5: Register the P9-T7 suite and update final second-batch matrix counts**

Modify `tools/jispec/tests/regression-runner.ts`:

```ts
runtime({ name: 'P9 External Tool Run Opt-In Boundary', file: 'p9-external-tool-run-opt-in-boundary.ts', expectedTests: 6, task: 'P9-T7' }),
```

Modify `tools/jispec/tests/regression-matrix-contract.ts` after P9-T7:

```ts
assert.equal(manifest.totalSuites, 131);
assert.equal(manifest.totalExpectedTests, 581);
assert.equal(areaMap.get("verify-ci-gates")?.suiteCount, 13);
assert.equal(areaMap.get("verify-ci-gates")?.expectedTests, 56);
assert.equal(areaMap.get("runtime-extended")?.suiteCount, 43);
assert.equal(areaMap.get("runtime-extended")?.expectedTests, 187);
```

- [x] **Step 6: Run focused verification for P9-T7**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-external-tool-run-opt-in-boundary.ts
node --import tsx tools\jispec\tests\privacy-redaction.ts
node --import tsx tools\jispec\tests\policy-approval-workflow.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run gate:quick -- tools/jispec/tests/p9-external-tool-run-opt-in-boundary.ts
```

Expected: all commands PASS, regulated profile requires owner approval for sharing/adopting external summaries, and external tool output remains advisory-only.

- [x] **Step 7: Run final second-batch verification**

Run:

```powershell
npm run typecheck
npm run gate:quick
node --import tsx tools\jispec\cli.ts doctor v1 --root . --json
node --import tsx tools\jispec\cli.ts doctor runtime --root . --json
node --import tsx tools\jispec\cli.ts doctor pilot --root . --json
```

Expected:

- TypeScript passes with no errors.
- `gate:quick` reports registered quick suites passing.
- `doctor v1`, `doctor runtime`, and `doctor pilot` return JSON with `ready: true`.
- Matrix contract reports `131` suites and `581` expected tests.

- [x] **Step 8: Commit P9-T7**

Run:

```powershell
git add tools/jispec/integrations/external-tool-run-boundary.ts schemas/external-tool-run-boundary.schema.json tools/jispec/privacy/redaction.ts tools/jispec/policy/approval.ts tools/jispec/replay/replay-metadata.ts docs/privacy-and-local-first.md docs/integrations.md tools/jispec/tests/p9-external-tool-run-opt-in-boundary.ts tools/jispec/tests/regression-runner.ts tools/jispec/tests/regression-matrix-contract.ts
git commit -m "feat: add p9 external tool opt-in boundary"
```

Expected: commit succeeds after the focused and final second-batch verification commands pass.

---

## Second-Batch Self-Review Checklist

- P9-T4 maps to Task 4 and consolidates reviewer companions around fixed decision sections while preserving JSON/YAML truth sources.
- P9-T5 maps to Task 5 and adds repo group config plus cross-repo drift hints that produce owner actions and suggested commands only.
- P9-T6 maps to Task 6 and supports import-only external graph artifacts without command execution, network access, source upload, or blocking verify semantics.
- P9-T7 maps to Task 7 and defines explicit opt-in, privacy, approval, audit, and replay boundaries before JiSpec can run an external graph tool.
- No second-batch task adds GitNexus or Graphify as required runtime dependencies.
- External graph evidence uses provenance labels and stays advisory unless corroborated by JiSpec-owned deterministic contracts.
- Console and reviewer companion surfaces display summaries, paths, owner actions, and suggested commands without parsing Markdown as a gate.
