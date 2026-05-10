import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import {
  normalizeMutationBoundary,
  type MutationBoundaryProjection,
} from "../change/mutation-boundary-model";
import { runChangeCommand } from "../change/change-command";
import { cleanupVerifyFixture, createVerifyFixture } from "./verify-test-helpers";

async function main(): Promise<void> {
  console.log("=== Mutation Boundary Model Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    const first = normalizeMutationBoundary(buildInput("git_diff", "chg-20260510-readme-refresh"));
    const second = normalizeMutationBoundary(buildInput("git_diff", "chg-20260510-readme-refresh"));
    assert.deepEqual(second, first);
    assert.equal(first.classification, "derived_change");
    assert.equal(first.mutation.source, "git_diff");
    assert.equal(first.hypothesis.classification, "derived_change");
    assert.ok(first.candidateChangeIds.includes("chg-20260510-readme-refresh"));
    assert.ok(first.normalizedFacts.includes("docs/README.md"));
    console.log("✓ Test 1: identical mutation inputs normalize deterministically");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  try {
    const cases: Array<{
      name: string;
      input: Parameters<typeof normalizeMutationBoundary>[0];
      expected: MutationBoundaryProjection["classification"];
    }> = [
      {
        name: "git diff",
        input: buildInput("git_diff", "docs update", ["README.md"], ["docs/README.md", "chg-20260510-readme-refresh"]),
        expected: "derived_change",
      },
      {
        name: "git commit",
        input: buildInput("git_commit", "commit aligns with change intent", ["src/domain/order.ts"], ["change_id: chg-20260510-order-update", "src/domain/order.ts"]),
        expected: "derived_change",
      },
      {
        name: "external patch",
        input: buildInput("external_patch", "external patch confirms change intent", ["src/domain/cart.ts"], ["change_id: chg-20260510-cart-update", "src/domain/cart.ts"]),
        expected: "derived_change",
      },
      {
        name: "ci patch",
        input: buildInput("ci_patch", "ci autofix without canonical anchor", ["src/generated/format.ts"], ["needs review", "format only"]),
        expected: "unmapped_mutation",
      },
      {
        name: "ide patch",
        input: buildInput("ide_patch", "editor hot edit", ["src/domain/profile.ts"], ["needs review", "unknown intent"]),
        expected: "unmapped_mutation",
      },
    ];

    for (const testCase of cases) {
      const projected = normalizeMutationBoundary(testCase.input);
      assert.equal(projected.classification, testCase.expected, `${testCase.name} classification mismatch`);
      assert.ok(projected.mutation.id.length > 0);
      assert.ok(projected.hypothesis.id.length > 0);
      assert.ok(projected.reasons.length > 0);
    }
    console.log("✓ Test 2: source fixtures project into derived_change or unmapped_mutation deterministically");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  }

  const fixtureRoot = createVerifyFixture("mbm-change-command");
  try {
    seedGitRepository(fixtureRoot);
    fs.appendFileSync(path.join(fixtureRoot, "README.md"), "\nUpdated docs through change command.\n", "utf-8");

    const change = await runChangeCommand({
      root: fixtureRoot,
      summary: "Update README docs",
      mode: "prompt",
      json: true,
    });
    assert.equal(change.session.mutationBoundary?.classification, "derived_change");
    assert.ok(change.session.mutationBoundary?.normalizedFacts.includes("docs_only:README.md"));
    assert.ok(change.session.mutationBoundary?.reasons.some((reason) => reason.includes("confidence")));
    assert.match(change.text, /Change ID:/);
    assert.match(change.text, /Provenance binding:/);
    console.log("✓ Test 3: change command stores the normalized mutation projection on the session");
    passed++;
  } catch (error) {
    failed += reportFailure(passed + failed + 1, error);
  } finally {
    cleanupVerifyFixture(fixtureRoot);
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

function buildInput(
  source: Parameters<typeof normalizeMutationBoundary>[0]["source"],
  summary: string,
  touchedPaths: string[] = ["docs/README.md"],
  facts: string[] = [summary, "docs/README.md"],
  history: string[] = [],
): Parameters<typeof normalizeMutationBoundary>[0] {
  return {
    source,
    summary,
    touchedPaths,
    facts,
    history,
    payload: {
      source,
      summary,
      touchedPaths,
    },
    observedAt: "2026-05-10T00:00:00.000Z",
  };
}

function seedGitRepository(root: string): void {
  fs.writeFileSync(path.join(root, "README.md"), "# MBM Fixture\n\nBaseline docs.\n", "utf-8");
  fs.writeFileSync(
    path.join(root, "package.json"),
    JSON.stringify({ name: "mbm-fixture", private: true }, null, 2),
    "utf-8",
  );

  const commands: Array<{ args: string[]; label: string }> = [
    { args: ["init"], label: "git init" },
    { args: ["config", "user.email", "mbm@example.com"], label: "git config user.email" },
    { args: ["config", "user.name", "JiSpec MBM"], label: "git config user.name" },
    { args: ["add", "."], label: "git add ." },
    { args: ["commit", "-m", "baseline"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync("git", command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed to initialize git repository at ${command.label}: ${result.stderr}`);
    }
  }
}

function reportFailure(testNumber: number, error: unknown): 1 {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`✗ Test ${testNumber} failed: ${message}`);
  return 1;
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
