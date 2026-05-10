import assert from "node:assert/strict";
import {
  createKernelArtifactRef,
  createKernelId,
  createKernelIdentity,
  parseKernelRecord,
  serializeKernelRecord,
  stableKernelList,
  type AmbiguityDebtRecord,
  type ChangeHypothesis,
  type KernelMutation,
  type KernelProvenanceLink,
  type KernelState,
  type KernelTransitionResult,
} from "../kernel/shared-models";
import { buildKernelProvenanceBinding, resolveCanonicalChangeId } from "../kernel/provenance";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Kernel Shared Models Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("kernel ids and stable lists normalize deterministically", () => {
    const idA = createKernelId("mutation", "git-diff:src/app.ts");
    const idB = createKernelId("mutation", "git-diff:src/app.ts");
    assert.equal(idA, idB);
    assert.match(idA, /^mutation-/);

    const identity = createKernelIdentity("kernel", "change-001", new Date("2026-05-10T00:00:00.000Z"));
    assert.equal(identity.id, createKernelId("kernel", "change-001"));
    assert.equal(identity.createdAt, "2026-05-10T00:00:00.000Z");

    assert.deepEqual(stableKernelList(["b", "a", "b", "  c  ", ""]), ["a", "b", "c"]);
  }));

  results.push(record("canonical change ids resolve from session change ids and spec deltas", () => {
    const session = {
      id: "change-session-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      changeId: "change-canonical-1",
      specDelta: {
        changeId: "change-spec-delta-1",
      },
    } as Parameters<typeof buildKernelProvenanceBinding>[0];

    assert.equal(resolveCanonicalChangeId(session), "change-canonical-1");

    const specDeltaOnlySession = {
      id: "change-session-2",
      createdAt: "2026-05-10T00:00:00.000Z",
      specDelta: {
        changeId: "change-spec-delta-2",
      },
    } as Parameters<typeof buildKernelProvenanceBinding>[0];
    assert.equal(resolveCanonicalChangeId(specDeltaOnlySession), "change-spec-delta-2");

    const binding = buildKernelProvenanceBinding(session);
    assert.equal(binding.changeId, "change-canonical-1");
    assert.equal(binding.changeSessionId, "change-session-1");
    assert.match(binding.id, /^provenance-/);
    assert.equal(binding.source, "active_change_session");
  }));

  results.push(record("mutation and hypothesis records round-trip through canonical serialization", () => {
    const lineage: KernelProvenanceLink[] = [
      {
        id: "link-1",
        createdAt: "2026-05-10T00:00:00.000Z",
        sourceId: "mutation-1",
        sourceKind: "mutation",
        targetId: "hypothesis-1",
        targetKind: "change_hypothesis",
        relationship: "normalized_from",
        confidence: 0.92,
        reason: "git diff normalized into a change hypothesis",
      },
    ];

    const mutation: KernelMutation = {
      id: "mutation-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      source: "git_diff",
      summary: "src/app.ts changed",
      status: "observed",
      path: "src/app.ts",
      confidence: 0.87,
      reason: "git diff",
      payload: {
        paths: ["src/app.ts"],
        changeCount: 1,
      },
      lineage,
    };
    const mutationJson = serializeKernelRecord(mutation);
    const mutationRoundTrip = parseKernelRecord<KernelMutation>(mutationJson);
    assert.deepEqual(mutationRoundTrip, mutation);
    assert.ok(!mutationJson.includes("\"undefined\""));

    const hypothesis: ChangeHypothesis = {
      id: "hypothesis-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      mutationId: mutation.id,
      classification: "derived_change",
      status: "normalized",
      summary: "Normalize app.ts update into derived change",
      confidence: 0.9,
      reasons: ["path is in workspace", "diff is deterministic"],
      facts: ["verify.issue_count=0"],
      policyVersion: "1.0",
      candidateChangeIds: ["change-1"],
      lineage,
    };
    const hypothesisRoundTrip = parseKernelRecord<ChangeHypothesis>(serializeKernelRecord(hypothesis));
    assert.deepEqual(hypothesisRoundTrip, hypothesis);
  }));

  results.push(record("ambiguity debt, state, and transition result remain structurally stable", () => {
    const lineage: KernelProvenanceLink[] = [
      {
        id: "link-2",
        createdAt: "2026-05-10T00:00:00.000Z",
        sourceId: "mutation-2",
        sourceKind: "mutation",
        targetId: "debt-1",
        targetKind: "ambiguity_debt",
        relationship: "resolved_into",
        confidence: 0.55,
        reason: "mutation could not be assigned a canonical change yet",
      },
    ];

    const debt: AmbiguityDebtRecord = {
      id: "debt-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      mutationId: "mutation-2",
      status: "open",
      owner: "platform-lead",
      reason: "Cannot map external docs update to canonical change yet.",
      confidence: 0.55,
      nextReview: "2026-05-17T00:00:00.000Z",
      source: "external_patch",
      candidateChangeIds: ["change-2", "change-3"],
      lineage,
    };
    assert.deepEqual(parseKernelRecord<AmbiguityDebtRecord>(serializeKernelRecord(debt)), debt);

    const state: KernelState<{ stage: string }> = {
      id: "state-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      kind: "change_runtime",
      status: "normalized",
      payload: { stage: "verify" },
      lineage,
    };

    const transition: KernelTransitionResult<typeof state, { output: string }> = {
      id: "transition-1",
      createdAt: "2026-05-10T00:00:00.000Z",
      changeId: "change-1",
      fromState: state,
      toState: {
        ...state,
        id: "state-2",
        status: "committed",
        payload: { stage: "commit" },
      },
      decision: "approve",
      outputs: [{ output: "kernel-log" }],
      provenance: lineage,
      committed: true,
    };

    const roundTrip = parseKernelRecord<KernelTransitionResult<typeof state, { output: string }>>(
      serializeKernelRecord(transition),
    );
    assert.deepEqual(roundTrip, transition);
  }));

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

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return { name, passed: false, error: error instanceof Error ? error.message : String(error) };
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
