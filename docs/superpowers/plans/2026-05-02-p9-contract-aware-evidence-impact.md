# P9 Contract-Aware Evidence and Impact Implementation Plan

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

This plan intentionally does not implement:

- `P9-T4 Reviewer Companion Consolidation`
- `P9-T5 Multi-Repo Contract Drift Hints`
- `P9-T6 External Graph Adapter Import-Only`
- `P9-T7 External Tool Run Opt-In Boundary`

Those later tasks should consume the labels and impact summary contracts created here.

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

After this plan is complete:

- Total suites: `127`
- Total expected tests: `556`
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

状态：开发中
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

- [ ] **Step 1: Write the failing provenance label tests**

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

- [ ] **Step 2: Run the P9-T2 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-evidence-provenance-labels.ts
```

Expected: FAIL because `tools/jispec/provenance/evidence-provenance.ts` does not exist and evidence artifacts do not yet expose `provenanceLabel`.

- [ ] **Step 3: Add the shared provenance helper**

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

- [ ] **Step 4: Wire provenance descriptors into bootstrap ranked evidence**

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

- [ ] **Step 5: Wire provenance descriptors into contract source adapters**

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

- [ ] **Step 6: Wire provenance descriptors into Greenfield evidence graph**

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

- [ ] **Step 7: Register the P9-T2 regression suite and update counts**

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

状态：开发中
```

- [ ] **Step 8: Run focused verification for P9-T2**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-evidence-provenance-labels.ts
node --import tsx tools\jispec\tests\contract-source-adapters.ts
node --import tsx tools\jispec\tests\greenfield-evidence-graph.ts
node --import tsx tools\jispec\tests\regression-matrix-contract.ts
npm run typecheck
```

Expected: all commands PASS.

- [ ] **Step 9: Commit P9-T2**

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

- [ ] **Step 1: Write the failing change impact summary tests**

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

- [ ] **Step 2: Run the P9-T3 test and verify it fails**

Run:

```powershell
node --import tsx tools\jispec\tests\p9-change-impact-summary.ts
```

Expected: FAIL because `tools/jispec/change/impact-summary.ts` does not exist and `impactSummary` is still a string array.

- [ ] **Step 3: Add the shared change impact summary helper**

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

- [ ] **Step 4: Convert change session impact summary to structured data**

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

- [ ] **Step 5: Attach impact summary to spec delta result**

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

- [ ] **Step 6: Surface impact scope in implement handoff packets**

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

- [ ] **Step 7: Add advisory impact freshness to verify and CI summaries**

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

- [ ] **Step 8: Register the P9-T3 regression suite and update final counts**

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

状态：开发中
```

- [ ] **Step 9: Run focused verification for P9-T3**

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

- [ ] **Step 10: Run the full post-release gate**

Run:

```powershell
npm run post-release:gate
```

Expected: PASS with `127/127` suites and `556/556` expected tests after the P9 suites are registered.

- [ ] **Step 11: Mark first P9 batch completed and commit**

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
