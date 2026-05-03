import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { main as runCliMain } from "../cli";
import { readAuditEvents } from "../audit/event-ledger";
import { runChangeCommand } from "../change/change-command";
import { runGreenfieldInit } from "../greenfield/init";
import { collectGreenfieldProvenanceAnchorDrift } from "../greenfield/provenance-drift";
import { runGreenfieldSourceAdopt, runGreenfieldSourceReviewTransition } from "../greenfield/source-governance";
import { renderGreenfieldSourceRefreshText, runGreenfieldSourceRefresh } from "../greenfield/source-refresh";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

async function main(): Promise<void> {
  console.log("=== Greenfield Source Refresh Tests ===\n");

  const root = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-source-refresh-"));
  const sourceRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-source-refresh-src-"));
  const results: TestResult[] = [];

  try {
    const requirementsPath = path.join(sourceRoot, "requirements.md");
    const technicalSolutionPath = path.join(sourceRoot, "technical-solution.md");
    fs.writeFileSync(requirementsPath, buildRequirements(), "utf-8");
    fs.writeFileSync(technicalSolutionPath, buildTechnicalSolution(), "utf-8");

    runGreenfieldInit({
      root,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const change = await runChangeCommand({
      root,
      summary: "Expand checkout validation source contract",
      mode: "prompt",
      changeType: "modify",
      contextId: "ordering",
    });

    const workspaceRequirementsPath = path.join(root, "docs", "input", "requirements.md");
    fs.writeFileSync(
      workspaceRequirementsPath,
      fs.readFileSync(workspaceRequirementsPath, "utf-8").replace(
        "Checkout must reject unavailable items.",
        "Checkout must reject unavailable or recalled items.",
      ),
      "utf-8",
    );

    const refresh = runGreenfieldSourceRefresh({
      root,
      change: change.session.specDelta?.changeId,
    });
    let blockedAdoptMessage = "";
    try {
      runGreenfieldSourceAdopt({
        root,
        change: change.session.specDelta?.changeId,
        actor: "architect",
        reason: "should block before source review",
        now: "2026-04-29T00:00:00.000Z",
      });
    } catch (error) {
      blockedAdoptMessage = error instanceof Error ? error.message : String(error);
    }
    const sourceEvolution = JSON.parse(fs.readFileSync(refresh.sourceEvolutionPath, "utf-8")) as {
      items?: Array<{ evolution_id?: string; anchor_id?: string; evolution_kind?: string }>;
    };
    const modifiedItemId = sourceEvolution.items?.find((item) => item.anchor_id === "REQ-ORD-002" && item.evolution_kind === "modified")?.evolution_id;
    if (!modifiedItemId) {
      throw new Error("Expected modified source evolution item for REQ-ORD-002.");
    }
    const review = runGreenfieldSourceReviewTransition({
      root,
      change: change.session.specDelta?.changeId,
      itemId: modifiedItemId,
      action: "adopt",
      actor: "architect",
      reason: "Expanded validation rule is accepted as the new requirement truth.",
      now: "2026-04-29T00:00:00.000Z",
    });
    const adopted = runGreenfieldSourceAdopt({
      root,
      change: change.session.specDelta?.changeId,
      actor: "architect",
      reason: "Promote reviewed source change into active truth.",
      now: "2026-04-29T00:00:00.000Z",
    });
    const proposedSnapshot = yaml.load(fs.readFileSync(path.join(root, ".spec", "deltas", refresh.changeId, "source-documents.proposed.yaml"), "utf-8")) as {
      snapshot?: { status?: string };
      source_documents?: {
        requirements?: {
          checksum?: string;
        };
      };
    };
    const activeSnapshot = yaml.load(fs.readFileSync(path.join(root, ".spec", "greenfield", "source-documents.active.yaml"), "utf-8")) as {
      snapshot?: { id?: string; status?: string; adopted_by_change?: string };
      source_documents?: {
        requirements?: {
          checksum?: string;
        };
      };
    };
    const lifecycle = yaml.load(fs.readFileSync(path.join(root, ".spec", "requirements", "lifecycle.yaml"), "utf-8")) as {
      registry_version?: number;
      active_snapshot_id?: string;
      last_adopted_change_id?: string;
      requirements?: Array<{ id?: string; status?: string; modified_by_change?: string | null }>;
    };
    const baseline = yaml.load(fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8")) as {
      source_snapshot?: { active_snapshot_id?: string; lifecycle_registry_version?: number; last_adopted_change_id?: string | null };
      requirement_lifecycle?: { registry_version?: number; last_adopted_change_id?: string | null };
      source_evolution?: { last_adopted_change_id?: string | null; source_review_path?: string };
      requirement_ids?: string[];
      applied_deltas?: string[];
    };
    const auditTypes = readAuditEvents(root).map((event) => event.type);

    results.push(record("source refresh plus source adopt promote reviewed source truth into lifecycle and baseline metadata", () => {
      assert.equal(refresh.changeId, change.session.specDelta?.changeId);
      assert.equal(refresh.comparison.changed, true);
      assert.ok(refresh.comparison.documentChecksumChanged.includes("requirements"));
      assert.equal(refresh.comparison.addedRequirementIds.length, 0);
      assert.equal(refresh.comparison.removedRequirementIds.length, 0);
      assert.equal(proposedSnapshot.snapshot?.status, "proposed");
      assert.match(blockedAdoptMessage, /still need adopt, defer, or waive/i);
      assert.equal(review.decision.status, "adopted");
      assert.equal(adopted.changeId, refresh.changeId);
      assert.equal(activeSnapshot.snapshot?.status, "active");
      assert.equal(activeSnapshot.snapshot?.adopted_by_change, refresh.changeId);
      assert.ok(fs.existsSync(refresh.sourceEvolutionPath));
      assert.ok(fs.existsSync(refresh.sourceEvolutionMarkdownPath));
      assert.match(fs.readFileSync(refresh.sourceEvolutionMarkdownPath, "utf-8"), /modified/);
      assert.equal(
        proposedSnapshot.source_documents?.requirements?.checksum,
        activeSnapshot.source_documents?.requirements?.checksum,
      );
      assert.equal(lifecycle.last_adopted_change_id, refresh.changeId);
      assert.equal(lifecycle.registry_version, 2);
      assert.equal(lifecycle.active_snapshot_id, activeSnapshot.snapshot?.id);
      assert.ok(lifecycle.requirements?.some((entry) =>
        entry.id === "REQ-ORD-002" &&
        entry.status === "modified" &&
        entry.modified_by_change === refresh.changeId
      ));
      assert.equal(baseline.source_snapshot?.active_snapshot_id, activeSnapshot.snapshot?.id);
      assert.equal(baseline.source_snapshot?.lifecycle_registry_version, 2);
      assert.equal(baseline.source_snapshot?.last_adopted_change_id, refresh.changeId);
      assert.equal(baseline.requirement_lifecycle?.registry_version, 2);
      assert.equal(baseline.requirement_lifecycle?.last_adopted_change_id, refresh.changeId);
      assert.equal(baseline.source_evolution?.last_adopted_change_id, refresh.changeId);
      assert.equal(baseline.source_evolution?.source_review_path, `.spec/deltas/${refresh.changeId}/source-review.yaml`);
      assert.equal(baseline.requirement_ids?.includes("REQ-ORD-002"), true);
      assert.equal(baseline.applied_deltas?.includes(refresh.changeId), true);
      assert.ok(auditTypes.includes("source_refresh"));
      assert.ok(auditTypes.includes("source_review_adopt"));
      assert.ok(auditTypes.includes("source_adopt"));
      assert.match(renderGreenfieldSourceRefreshText(refresh), /source-evolution\.md/);
    }));

    const cliRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-source-refresh-cli-"));
    runGreenfieldInit({
      root: cliRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const cliChange = await runChangeCommand({
      root: cliRoot,
      summary: "Add refund intake source contract",
      mode: "prompt",
      changeType: "add",
      contextId: "ordering",
    });
    fs.writeFileSync(
      path.join(cliRoot, "docs", "input", "requirements.md"),
      `${fs.readFileSync(path.join(cliRoot, "docs", "input", "requirements.md"), "utf-8")}\n\n### REQ-ORD-999\n\nRefund intake must be tracked.\n`,
      "utf-8",
    );
    const cliOutput = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "refresh",
      "--root",
      cliRoot,
      "--change",
      cliChange.session.specDelta?.changeId ?? "latest",
      "--json",
    ]);
    const cliReviewList = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "review",
      "list",
      "--root",
      cliRoot,
      "--change",
      cliChange.session.specDelta?.changeId ?? "latest",
      "--json",
    ]);
    const cliReviewPayload = JSON.parse(cliReviewList.stdout) as {
      items?: Array<{ itemId?: string; anchorId?: string; evolutionKind?: string; effectiveStatus?: string }>;
    };
    const cliAddedItemId = cliReviewPayload.items?.find((item) => item.anchorId === "REQ-ORD-999" && item.evolutionKind === "added")?.itemId;
    if (!cliAddedItemId) {
      throw new Error("Expected CLI source review list to expose the added REQ-ORD-999 item.");
    }
    const cliReviewAdopt = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "review",
      "adopt",
      cliAddedItemId,
      "--root",
      cliRoot,
      "--change",
      cliChange.session.specDelta?.changeId ?? "latest",
      "--actor",
      "architect",
      "--reason",
      "Refund intake requirement is accepted into the pilot source baseline.",
      "--json",
    ]);
    const cliAdopt = await runCliAndCapture([
      "node",
      "jispec-cli",
      "source",
      "adopt",
      "--root",
      cliRoot,
      "--change",
      cliChange.session.specDelta?.changeId ?? "latest",
      "--actor",
      "architect",
      "--reason",
      "Promote reviewed refund intake source delta.",
      "--json",
    ]);
    const cliPayload = JSON.parse(cliOutput.stdout) as {
      comparison?: {
        changed?: boolean;
        addedRequirementIds?: string[];
      };
      proposedSnapshotPath?: string;
    };
    const cliReviewAdoptPayload = JSON.parse(cliReviewAdopt.stdout) as {
      decision?: { status?: string };
    };
    const cliAdoptPayload = JSON.parse(cliAdopt.stdout) as {
      activeSnapshotPath?: string;
      lifecyclePath?: string;
      appliedDeltas?: string[];
    };
    results.push(record("CLI source refresh exposes comparison and proposed snapshot path", () => {
      assert.equal(cliOutput.code, 0);
      assert.equal(cliReviewList.code, 0);
      assert.equal(cliReviewAdopt.code, 0);
      assert.equal(cliAdopt.code, 0);
      assert.equal(cliPayload.comparison?.changed, true);
      assert.equal(cliPayload.comparison?.addedRequirementIds?.includes("REQ-ORD-999"), true);
      assert.equal(cliReviewAdoptPayload.decision?.status, "adopted");
      assert.ok(cliPayload.proposedSnapshotPath?.endsWith("/source-documents.proposed.yaml"));
      assert.ok(fs.existsSync(cliPayload.proposedSnapshotPath ?? ""));
      assert.ok(cliAdoptPayload.activeSnapshotPath?.endsWith("/.spec/greenfield/source-documents.active.yaml"));
      assert.ok(cliAdoptPayload.lifecyclePath?.endsWith("/.spec/requirements/lifecycle.yaml"));
      assert.equal(cliAdoptPayload.appliedDeltas?.includes(cliChange.session.specDelta?.changeId ?? "missing-change-id"), true);
    }));
    fs.rmSync(cliRoot, { recursive: true, force: true });

    const legacyRoot = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-greenfield-source-refresh-legacy-"));
    runGreenfieldInit({
      root: legacyRoot,
      requirements: requirementsPath,
      technicalSolution: technicalSolutionPath,
    });
    const legacyChange = await runChangeCommand({
      root: legacyRoot,
      summary: "Legacy manifest source refresh compatibility",
      mode: "prompt",
      changeType: "modify",
      contextId: "ordering",
    });
    const legacyCompatPath = path.join(legacyRoot, ".spec", "greenfield", "source-documents.yaml");
    const legacyActivePath = path.join(legacyRoot, ".spec", "greenfield", "source-documents.active.yaml");
    const legacyCompatText = fs.readFileSync(legacyCompatPath, "utf-8")
      .replace(/^snapshot:\r?\n(?:\s{2}.+\r?\n)+/m, "");
    fs.writeFileSync(legacyCompatPath, legacyCompatText, "utf-8");
    fs.rmSync(legacyActivePath, { force: true });
    fs.writeFileSync(
      path.join(legacyRoot, "docs", "input", "requirements.md"),
      fs.readFileSync(path.join(legacyRoot, "docs", "input", "requirements.md"), "utf-8").replace(
        "Checkout must reject unavailable items.",
        "Checkout must reject unavailable or blocked items.",
      ),
      "utf-8",
    );
    const legacyRefresh = runGreenfieldSourceRefresh({
      root: legacyRoot,
      change: legacyChange.session.specDelta?.changeId,
    });
    const legacyDrifts = collectGreenfieldProvenanceAnchorDrift(legacyRoot);
    results.push(record("Phase 0 fallback treats legacy source-documents.yaml as the active snapshot", () => {
      assert.equal(legacyRefresh.activeSnapshotPath.endsWith("/.spec/greenfield/source-documents.yaml"), true);
      assert.equal(legacyRefresh.comparison.changed, true);
      assert.ok(legacyRefresh.comparison.documentChecksumChanged.includes("requirements"));
      assert.ok(legacyDrifts.some((drift) => drift.anchorId === "REQ-ORD-002" && drift.path === "docs/input/requirements.md"));
    }));
    fs.rmSync(legacyRoot, { recursive: true, force: true });
  } catch (error) {
    results.push({
      name: "greenfield source refresh execution",
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(sourceRoot, { recursive: true, force: true });
  }

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

function record(name: string, run: () => void): TestResult {
  try {
    run();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

async function runCliAndCapture(argv: string[]): Promise<{ code: number; stdout: string; stderr: string }> {
  const previousLog = console.log;
  const previousError = console.error;
  const previousExitCode = process.exitCode;
  const stdout: string[] = [];
  const stderr: string[] = [];

  console.log = (message?: unknown, ...optional: unknown[]) => {
    stdout.push([message, ...optional].map(String).join(" "));
  };
  console.error = (message?: unknown, ...optional: unknown[]) => {
    stderr.push([message, ...optional].map(String).join(" "));
  };
  process.exitCode = undefined;

  try {
    const code = await runCliMain(argv);
    return {
      code,
      stdout: stdout.join("\n"),
      stderr: stderr.join("\n"),
    };
  } finally {
    console.log = previousLog;
    console.error = previousError;
    process.exitCode = previousExitCode;
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
