import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import {
  analyzeGreenfieldBlastRadius,
  buildBlastRadiusGraphPayload,
  renderBlastRadiusReport,
  renderVerifyFocusYaml,
  type BlastRadiusAnalysis,
} from "./blast-radius";
import {
  analyzeDirtyPropagation,
  renderDirtyReport,
  renderDirtyVerifyFocusYaml,
  type DirtyAnalysis,
} from "../greenfield/contract-graph";
import {
  collectGreenfieldProvenanceAnchorDrift,
  renderGreenfieldProvenanceDriftWarnings,
} from "../greenfield/provenance-drift";
import { summarizeChangeImpact, type ChangeImpactSummary } from "./impact-summary";
import { splitDecisionCompanionSections } from "../companion/decision-sections";

export type SpecDeltaChangeType = "add" | "modify" | "deprecate" | "fix" | "redesign";
const SPEC_DELTA_CHANGE_TYPES = new Set<string>(["add", "modify", "deprecate", "fix", "redesign"]);

export interface SpecDeltaOptions {
  root: string;
  summary: string;
  changeType?: SpecDeltaChangeType;
  createdAt?: string;
  sliceId?: string;
  contextId?: string;
}

export interface SpecDeltaReferences {
  requirement_ids: string[];
  contexts: string[];
  contracts: string[];
  scenarios: string[];
  slices: string[];
  tests: string[];
}

export interface SpecDelta {
  change_id: string;
  summary: string;
  change_type: SpecDeltaChangeType;
  state: "proposed";
  created_at: string;
  baseline: {
    before: string;
    after: null;
  };
  references: SpecDeltaReferences;
  proposed_changes: Array<{
    kind: SpecDeltaChangeType;
    summary: string;
    status: "draft";
  }>;
  verification_focus: SpecDeltaReferences & {
    asset_paths: string[];
  };
  guardrails: {
    adopt_required: true;
    active_baseline_mutated: false;
  };
}

export interface SpecDeltaDraftResult {
  changeId: string;
  deltaDir: string;
  deltaPath: string;
  impactReportPath: string;
  impactGraphPath: string;
  verifyFocusPath: string;
  dirtyGraphPath: string;
  dirtyReportPath: string;
  handoffPath: string;
  adoptionRecordPath: string;
  impactSummary: ChangeImpactSummary;
  references: SpecDeltaReferences;
  blastRadius?: BlastRadiusAnalysis;
  dirtyAnalysis?: DirtyAnalysis;
}

interface CurrentBaseline {
  requirement_ids?: string[];
  contexts?: string[];
  contracts?: string[];
  scenarios?: string[];
  slices?: string[];
  assets?: string[];
}

export function isGreenfieldProject(rootInput: string): boolean {
  const projectPath = path.join(path.resolve(rootInput), "jiproject", "project.yaml");
  if (!fs.existsSync(projectPath)) {
    return false;
  }

  try {
    const project = yaml.load(fs.readFileSync(projectPath, "utf-8")) as { delivery_model?: unknown } | undefined;
    return project?.delivery_model === "greenfield-initialization";
  } catch {
    return false;
  }
}

export function draftSpecDelta(options: SpecDeltaOptions): SpecDeltaDraftResult | undefined {
  const root = path.resolve(options.root);
  if (!isGreenfieldProject(root)) {
    return undefined;
  }

  const createdAt = options.createdAt ?? new Date().toISOString();
  const changeType = options.changeType ?? inferChangeType(options.summary);
  const baselinePath = path.join(root, ".spec", "baselines", "current.yaml");
  const baseline = readCurrentBaseline(baselinePath);
  const blastRadius = analyzeGreenfieldBlastRadius(root, options);
  const references = buildReferences(root, baseline, options, blastRadius);
  const changeId = generateChangeId(options.summary, createdAt);
  const dirtyAnalysis = enrichDirtyAnalysisWithProvenanceDrift(analyzeDirtyPropagation(root, {
    changeId,
    summary: options.summary,
    contextId: options.contextId,
    sliceId: options.sliceId,
    generatedAt: createdAt,
  }), root);
  const deltaDir = path.join(root, ".spec", "deltas", changeId);
  fs.mkdirSync(deltaDir, { recursive: true });

  const delta: SpecDelta = {
    change_id: changeId,
    summary: options.summary,
    change_type: changeType,
    state: "proposed",
    created_at: createdAt,
    baseline: {
      before: ".spec/baselines/current.yaml",
      after: null,
    },
    references,
    proposed_changes: [
      {
        kind: changeType,
        summary: options.summary,
        status: "draft",
      },
    ],
    verification_focus: buildVerificationFocus(references, blastRadius),
    guardrails: {
      adopt_required: true,
      active_baseline_mutated: false,
    },
  };

  const deltaPath = path.join(deltaDir, "delta.yaml");
  const impactReportPath = path.join(deltaDir, "impact-report.md");
  const impactGraphPath = path.join(deltaDir, "impact-graph.json");
  const verifyFocusPath = path.join(deltaDir, "verify-focus.yaml");
  const dirtyGraphPath = path.join(deltaDir, "dirty-graph.json");
  const dirtyReportPath = path.join(deltaDir, "dirty-report.md");
  const handoffPath = path.join(deltaDir, "ai-implement-handoff.md");
  const adoptionRecordPath = path.join(deltaDir, "adoption-record.yaml");

  fs.writeFileSync(deltaPath, dumpYaml(delta), "utf-8");
  fs.writeFileSync(impactReportPath, renderImpactReport(delta, blastRadius, dirtyAnalysis), "utf-8");
  fs.writeFileSync(impactGraphPath, `${JSON.stringify(buildBlastRadiusGraphPayload(changeId, blastRadius, createdAt), null, 2)}\n`, "utf-8");
  fs.writeFileSync(dirtyGraphPath, `${JSON.stringify(dirtyAnalysis.dirtyGraph, null, 2)}\n`, "utf-8");
  fs.writeFileSync(dirtyReportPath, renderDirtyReport(dirtyAnalysis.dirtyGraph), "utf-8");
  fs.writeFileSync(verifyFocusPath, renderDirtyVerifyFocusYaml(changeId, dirtyAnalysis.dirtyGraph, loadYamlObject(renderVerifyFocusYaml(changeId, blastRadius))), "utf-8");
  fs.writeFileSync(handoffPath, renderChangeAiImplementHandoff(delta, dirtyAnalysis, blastRadius), "utf-8");
  fs.writeFileSync(adoptionRecordPath, dumpYaml(renderAdoptionRecord(delta)), "utf-8");

  return {
    changeId,
    deltaDir: normalizePath(deltaDir),
    deltaPath: normalizePath(deltaPath),
    impactReportPath: normalizePath(impactReportPath),
    impactGraphPath: normalizePath(impactGraphPath),
    verifyFocusPath: normalizePath(verifyFocusPath),
    dirtyGraphPath: normalizePath(dirtyGraphPath),
    dirtyReportPath: normalizePath(dirtyReportPath),
    handoffPath: normalizePath(handoffPath),
    adoptionRecordPath: normalizePath(adoptionRecordPath),
    impactSummary: summarizeChangeImpact({
      root,
      changeId,
      generatedAt: createdAt,
      summary: options.summary,
      changeType,
      contextId: options.contextId,
      sliceId: options.sliceId,
    }),
    references,
    blastRadius,
    dirtyAnalysis,
  };
}

function enrichDirtyAnalysisWithProvenanceDrift(dirtyAnalysis: DirtyAnalysis, root: string): DirtyAnalysis {
  const drifts = collectGreenfieldProvenanceAnchorDrift(root);
  if (drifts.length === 0) {
    return dirtyAnalysis;
  }

  const driftWarnings = renderGreenfieldProvenanceDriftWarnings(drifts);
  const driftUpdates = drifts.map((drift) => ({
    node_id: `provenance:${drift.anchorId}`,
    kind: "requirement" as const,
    path: drift.path,
    reason: `Source provenance anchor ${drift.anchorId} drifted (${drift.reason}) and must be re-anchored, adopted, deferred, or waived.`,
    status: "pending" as const,
  }));

  return {
    ...dirtyAnalysis,
    dirtyGraph: {
      ...dirtyAnalysis.dirtyGraph,
      dirty_asset_paths: unique([
        ...dirtyAnalysis.dirtyGraph.dirty_asset_paths,
        ...drifts.map((drift) => drift.path),
      ]),
      required_updates: [
        ...dirtyAnalysis.dirtyGraph.required_updates,
        ...driftUpdates,
      ],
      warnings: unique([
        ...dirtyAnalysis.dirtyGraph.warnings,
        ...driftWarnings,
      ]),
    },
  };
}

export function inferChangeType(summary: string): SpecDeltaChangeType {
  const normalized = summary.toLowerCase();
  if (/\b(fix|bug|hotfix|修复)\b/.test(normalized)) {
    return "fix";
  }
  if (/\b(deprecate|remove|retire|废弃|下线)\b/.test(normalized)) {
    return "deprecate";
  }
  if (/\b(redesign|revamp|rewrite|改版|重构)\b/.test(normalized)) {
    return "redesign";
  }
  if (/\b(modify|update|change|调整|修改)\b/.test(normalized)) {
    return "modify";
  }
  return "add";
}

export function isSpecDeltaChangeType(value: string | undefined): value is SpecDeltaChangeType {
  return typeof value === "string" && SPEC_DELTA_CHANGE_TYPES.has(value);
}

function readCurrentBaseline(baselinePath: string): CurrentBaseline {
  if (!fs.existsSync(baselinePath)) {
    return {};
  }

  const baseline = yaml.load(fs.readFileSync(baselinePath, "utf-8"));
  return typeof baseline === "object" && baseline !== null && !Array.isArray(baseline)
    ? baseline as CurrentBaseline
    : {};
}

function buildReferences(
  root: string,
  baseline: CurrentBaseline,
  options: SpecDeltaOptions,
  blastRadius: BlastRadiusAnalysis,
): SpecDeltaReferences {
  const fallback = buildFallbackReferences(root, baseline, options);
  const hasGraphImpact = blastRadius.available && blastRadius.affectedNodes.length > 0;

  if (!hasGraphImpact) {
    return fallback;
  }

  const requirementIds = unique([
    ...blastRadius.references.requirement_ids,
    ...extractRequirementIds(options.summary),
  ]);
  const contexts = preferSpecific(blastRadius.references.contexts, options.contextId);
  const slices = preferSpecific(blastRadius.references.slices, options.sliceId);

  return {
    requirement_ids: requirementIds,
    contexts,
    contracts: unique(blastRadius.references.contracts),
    scenarios: unique(blastRadius.references.scenarios),
    slices,
    tests: unique([
      ...blastRadius.references.tests,
      ...collectTestIds(root, slices),
    ]),
  };
}

function buildFallbackReferences(root: string, baseline: CurrentBaseline, options: SpecDeltaOptions): SpecDeltaReferences {
  const requirementIds = unique([
    ...(baseline.requirement_ids ?? []),
    ...extractRequirementIds(options.summary),
  ]);
  const contexts = preferSpecific(baseline.contexts ?? [], options.contextId);
  const slices = preferSpecific(baseline.slices ?? [], options.sliceId);

  return {
    requirement_ids: requirementIds,
    contexts,
    contracts: unique(baseline.contracts ?? []),
    scenarios: unique(baseline.scenarios ?? []),
    slices,
    tests: collectTestIds(root, slices),
  };
}

function buildVerificationFocus(
  references: SpecDeltaReferences,
  blastRadius: BlastRadiusAnalysis,
): SpecDelta["verification_focus"] {
  return {
    requirement_ids: references.requirement_ids,
    contexts: references.contexts,
    contracts: references.contracts,
    scenarios: references.scenarios,
    slices: references.slices,
    tests: references.tests,
    asset_paths: blastRadius.verificationFocus.asset_paths,
  };
}

function preferSpecific(values: string[], specific: string | undefined): string[] {
  if (specific) {
    return uniquePreserveOrder([specific, ...values]);
  }
  return uniquePreserveOrder(values);
}

function collectTestIds(root: string, sliceIds: string[]): string[] {
  const ids: string[] = [];
  const contextsRoot = path.join(root, "contexts");
  if (!fs.existsSync(contextsRoot)) {
    return ids;
  }

  for (const contextEntry of fs.readdirSync(contextsRoot, { withFileTypes: true })) {
    if (!contextEntry.isDirectory()) {
      continue;
    }
    for (const sliceId of sliceIds) {
      const testSpecPath = path.join(contextsRoot, contextEntry.name, "slices", sliceId, "test-spec.yaml");
      if (!fs.existsSync(testSpecPath)) {
        continue;
      }
      const parsed = yaml.load(fs.readFileSync(testSpecPath, "utf-8")) as { tests?: Array<{ id?: unknown }> } | undefined;
      if (!Array.isArray(parsed?.tests)) {
        continue;
      }
      ids.push(...parsed.tests.map((test) => test.id).filter((id): id is string => typeof id === "string"));
    }
  }

  return unique(ids);
}

function renderImpactReport(delta: SpecDelta, blastRadius: BlastRadiusAnalysis, dirtyAnalysis: DirtyAnalysis): string {
  return [
    `# Impact Report: ${delta.change_id}`,
    "",
    `Summary: ${delta.summary}`,
    `Change type: ${delta.change_type}`,
    `State: ${delta.state}`,
    "",
    ...splitDecisionCompanionSections({
      subject: `change delta ${delta.change_id}`,
      truthSources: [
        `.spec/deltas/${delta.change_id}/delta.yaml`,
        `.spec/deltas/${delta.change_id}/impact-graph.json`,
        `.spec/deltas/${delta.change_id}/verify-focus.yaml`,
      ],
      strongestEvidence: [
        `change type: ${delta.change_type}`,
        `contract graph: ${blastRadius.available ? "available" : "not_available_yet"}`,
        `dirty required updates: ${dirtyAnalysis.dirtyGraph.required_updates.length}`,
      ],
      inferredEvidence: [
        ...delta.references.slices.slice(0, 4).map((slice) => `slice impact: ${slice}`),
        ...dirtyAnalysis.dirtyGraph.dirty_asset_paths.slice(0, 4).map((assetPath) => `dirty asset: ${assetPath}`),
      ],
      drift: dirtyAnalysis.dirtyGraph.warnings.length > 0
        ? dirtyAnalysis.dirtyGraph.warnings.slice(0, 5)
        : [`impact graph freshness depends on .spec/deltas/${delta.change_id}/impact-graph.json`],
      impact: [
        ...delta.references.contracts.slice(0, 8).map((contract) => `contract: ${contract}`),
        ...delta.references.tests.slice(0, 8).map((test) => `test: ${test}`),
      ],
      nextSteps: [
        `review .spec/deltas/${delta.change_id}/verify-focus.yaml`,
        "run npm run jispec-cli -- verify",
      ],
      maxLines: 150,
    }),
    "",
    "## Affected References",
    "",
    ...renderReferenceList("Requirements", delta.references.requirement_ids),
    ...renderReferenceList("Contexts", delta.references.contexts),
    ...renderReferenceList("Contracts", delta.references.contracts),
    ...renderReferenceList("Scenarios", delta.references.scenarios),
    ...renderReferenceList("Slices", delta.references.slices),
    ...renderReferenceList("Tests", delta.references.tests),
    "",
    "## Blast Radius",
    "",
    renderBlastRadiusReport(delta.change_id, delta.summary, blastRadius).trim(),
    "",
    "## Dirty Propagation",
    "",
    `Contract graph: ${dirtyAnalysis.graphAvailable ? "available" : "missing"}`,
    `Dirty nodes: ${dirtyAnalysis.dirtyGraph.dirty_nodes.length}`,
    `Required updates: ${dirtyAnalysis.dirtyGraph.required_updates.length}`,
    "",
    "- `dirty-graph.json` is the machine-readable dirty subgraph.",
    "- `dirty-report.md` explains deterministic downstream propagation.",
    "- `verify-focus.yaml` includes dirty nodes and required updates.",
    "",
    "## Guardrails",
    "",
    "- Active baseline is not changed by this proposed delta.",
    "- Adoption must happen explicitly before this delta becomes active truth.",
    "- `impact-graph.json` is the machine-readable impact graph.",
    "- `dirty-graph.json` is the machine-readable deterministic contract dirty graph.",
    "- `verify-focus.yaml` lists the contracts, scenarios, slices, tests, and assets to include in focused verification.",
    "",
  ].join("\n");
}

function renderChangeAiImplementHandoff(
  delta: SpecDelta,
  dirtyAnalysis: DirtyAnalysis,
  blastRadius: BlastRadiusAnalysis,
): string {
  const dirty = dirtyAnalysis.dirtyGraph;
  return [
    `# AI Implement Handoff: ${delta.change_id}`,
    "",
    "## Change",
    "",
    `- Summary: ${delta.summary}`,
    `- Type: \`${delta.change_type}\``,
    `- State: \`${delta.state}\``,
    "- Active baseline remains unchanged until this delta is adopted.",
    "",
    ...splitDecisionCompanionSections({
      subject: `implementation handoff for ${delta.change_id}`,
      truthSources: [
        `.spec/deltas/${delta.change_id}/delta.yaml`,
        `.spec/deltas/${delta.change_id}/dirty-graph.json`,
        `.spec/deltas/${delta.change_id}/verify-focus.yaml`,
      ],
      strongestEvidence: [
        `dirty nodes: ${dirty.dirty_nodes.length}`,
        `required updates: ${dirty.required_updates.length}`,
        `contract graph: ${dirtyAnalysis.graphAvailable ? "available" : "not_available_yet"}`,
      ],
      inferredEvidence: dirty.dirty_asset_paths.slice(0, 6).map((assetPath) => `file needing attention: ${assetPath}`),
      drift: dirty.warnings.length > 0 ? dirty.warnings.slice(0, 5) : ["no conflict detected"],
      impact: [
        ...delta.verification_focus.contracts.slice(0, 8).map((contract) => `contract: ${contract}`),
        ...delta.verification_focus.tests.slice(0, 8).map((test) => `test: ${test}`),
      ],
      nextSteps: [
        "update, adopt, defer, or waive every pending dirty required update",
        "run jispec-cli verify --root . --policy .spec/policy.yaml",
      ],
      maxLines: 150,
    }),
    "",
    "## Dirty Subgraph",
    "",
    `- Contract graph: ${dirtyAnalysis.graphAvailable ? "available" : "missing"}`,
    `- Dirty nodes: ${dirty.dirty_nodes.length}`,
    `- Required updates: ${dirty.required_updates.length}`,
    "",
    ...(dirty.dirty_nodes.length > 0
      ? dirty.dirty_nodes.map((node) => `- \`${node.id}\` (${node.kind})${node.path ? ` -> \`${node.path}\`` : ""}`)
      : ["- None recorded."]),
    "",
    "## Required Updates",
    "",
    ...(dirty.required_updates.length > 0
      ? dirty.required_updates.map((update) => `- \`${update.node_id}\` (${update.kind}): ${update.reason}${update.path ? ` \`${update.path}\`` : ""}`)
      : ["- None recorded."]),
    "",
    "## Verification Focus",
    "",
    ...renderReferenceList("Requirements", delta.verification_focus.requirement_ids),
    ...renderReferenceList("Contexts", delta.verification_focus.contexts),
    ...renderReferenceList("Contracts", delta.verification_focus.contracts),
    ...renderReferenceList("Scenarios", delta.verification_focus.scenarios),
    ...renderReferenceList("Slices", delta.verification_focus.slices),
    ...renderReferenceList("Tests", delta.verification_focus.tests),
    "### Assets",
    "",
    ...(delta.verification_focus.asset_paths.length > 0
      ? delta.verification_focus.asset_paths.map((assetPath) => `- \`${assetPath}\``)
      : blastRadius.verificationFocus.asset_paths.map((assetPath) => `- \`${assetPath}\``)),
    "",
    "## Non-Goals",
    "",
    "- Do not mutate `.spec/baselines/current.yaml` from this handoff.",
    "- Do not ignore pending dirty required updates; adopt, defer, waive, or update them explicitly.",
    "- Do not reference rejected Review Pack decisions in implementation output.",
    "",
    "## Verify",
    "",
    "```bash",
    "jispec-cli verify --root . --policy .spec/policy.yaml",
    "```",
    "",
  ].join("\n");
}

function loadYamlObject(content: string): Record<string, unknown> {
  const parsed = yaml.load(content);
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function renderReferenceList(label: string, values: string[]): string[] {
  return [
    `### ${label}`,
    "",
    ...(values.length > 0 ? values.map((value) => `- \`${value}\``) : ["- None recorded."]),
    "",
  ];
}

function renderAdoptionRecord(delta: SpecDelta): Record<string, unknown> {
  return {
    change_id: delta.change_id,
    status: "pending",
    created_at: delta.created_at,
    adopted_at: null,
    adopter: null,
    baseline_before: delta.baseline.before,
    baseline_after: null,
    decisions: [],
    guardrails: {
      active_baseline_mutated: false,
      adopt_required: true,
    },
  };
}

function generateChangeId(summary: string, createdAt: string): string {
  const datePart = createdAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  const slug = slugify(summary).slice(0, 48) || "change";
  const hash = stableHash(`${createdAt}|${summary}`).slice(0, 8);
  return `chg-${datePart}-${slug}-${hash}`;
}

function stableHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index++) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function extractRequirementIds(value: string): string[] {
  return value.match(/\bREQ-[A-Z0-9-]+-\d+\b/g) ?? [];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values)).sort();
}

function uniquePreserveOrder(values: string[]): string[] {
  return Array.from(new Set(values));
}

function dumpYaml(value: unknown): string {
  return yaml.dump(value, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
