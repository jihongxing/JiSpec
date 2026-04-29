import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { draftGreenfieldApiContracts, type GreenfieldApiContractDraft } from "./api-contract-draft";
import { draftGreenfieldBehavior, renderScenarioFeature, type GreenfieldBehaviorDraft } from "./behavior-draft";
import { draftGreenfieldDomain, type GreenfieldContextDomainDraft, type GreenfieldDomainDraft } from "./domain-draft";
import {
  draftGreenfieldSliceQueue,
  renderSliceBehaviorsFeature,
  renderSliceDesign,
  renderSliceRequirements,
  renderSliceTasks,
  renderSliceTestSpec,
  renderSliceTrace,
  renderSliceYaml,
  type GreenfieldSliceQueueDraft,
} from "./slice-queue";
import type { GreenfieldInputContract } from "./source-documents";
import { draftGreenfieldVerifyGate, renderGreenfieldVerifyPolicy, type GreenfieldVerifyGateDraft } from "./verify-gate";
import {
  draftGreenfieldEvidenceGraph,
  renderGreenfieldEvidenceGraphSummary,
  type GreenfieldEvidenceGraph,
} from "./evidence-graph";
import { buildContractGraphFromEvidenceGraph, contractGraphPath } from "./contract-graph";
import { createEmptyGreenfieldSpecDebtLedger, renderGreenfieldSpecDebtLedger } from "./spec-debt-ledger";
import { draftGreenfieldReviewPack, type GreenfieldReviewPackDraft } from "./review-pack";
import { draftGreenfieldAiImplementHandoff, type GreenfieldAiImplementHandoff } from "./ai-implement-handoff";
import {
  buildGreenfieldChangeMainlineHandoff,
  renderGreenfieldChangeMainlineHandoffMarkdown,
  type GreenfieldChangeMainlineHandoff,
} from "./change-mainline-handoff";

export interface GreenfieldProjectAssetOptions {
  root: string;
  inputContract: GreenfieldInputContract;
  force?: boolean;
}

export interface GreenfieldProjectAssetResult {
  writtenFiles: string[];
  skippedFiles: string[];
  createdDirectories: string[];
}

interface WriteAssetOptions {
  root: string;
  relativePath: string;
  content: string;
  force: boolean;
  result: GreenfieldProjectAssetResult;
}

const REQUIREMENTS_TARGET = "docs/input/requirements.md";
const TECHNICAL_SOLUTION_TARGET = "docs/input/technical-solution.md";
const BUNDLED_SCHEMA_FILES = [
  "agent-output.schema.json",
  "context.schema.json",
  "contracts.schema.json",
  "project.schema.json",
  "slice.schema.json",
  "tasks.schema.json",
  "trace.schema.json",
] as const;
const BUNDLED_AGENT_FILES = [
  "agents.yaml",
  "pipeline.yaml",
] as const;

export function writeGreenfieldProjectAssets(options: GreenfieldProjectAssetOptions): GreenfieldProjectAssetResult {
  const root = path.resolve(options.root);
  const force = options.force === true;
  const result: GreenfieldProjectAssetResult = {
    writtenFiles: [],
    skippedFiles: [],
    createdDirectories: [],
  };

  ensureDirectory(root, ".", result);
  for (const directory of [
    "docs/input",
    "jiproject",
    ".spec/greenfield",
    ".spec/greenfield/review-pack",
    ".spec/baselines/releases",
    ".spec/deltas",
    ".spec/spec-debt",
    ".spec/evidence",
    ".spec/releases",
    ".spec/ci",
    ".github/workflows",
    "schemas",
    "agents",
  ]) {
    ensureDirectory(root, directory, result);
  }

  const requirementsContent = readRequiredSource(options.inputContract.requirements.path, "requirements");
  const technicalSolutionContent = options.inputContract.technicalSolution.exists && options.inputContract.technicalSolution.path
    ? fs.readFileSync(options.inputContract.technicalSolution.path, "utf-8")
    : renderMissingTechnicalSolutionPlaceholder(options.inputContract);

  writeAsset({
    root,
    relativePath: REQUIREMENTS_TARGET,
    content: requirementsContent,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: TECHNICAL_SOLUTION_TARGET,
    content: technicalSolutionContent,
    force,
    result,
  });

  const identity = inferProjectIdentity(requirementsContent, root);
  const domainDraft = draftGreenfieldDomain({
    requirementsContent,
    technicalSolutionContent,
    requirementIds: options.inputContract.requirements.requirementIds ?? [],
    technicalSolutionMissing: options.inputContract.technicalSolution.status === "missing",
  });
  const apiContractDraft = draftGreenfieldApiContracts({
    requirementsContent,
    technicalSolutionContent,
    technicalSolutionMissing: options.inputContract.technicalSolution.status === "missing",
    domainDraft,
  });
  const behaviorDraft = draftGreenfieldBehavior({
    requirementsContent,
    requirementIds: options.inputContract.requirements.requirementIds ?? [],
    domainDraft,
  });
  const sliceQueueDraft = draftGreenfieldSliceQueue({
    domainDraft,
    apiContractDraft,
    behaviorDraft,
  });
  const verifyGateDraft = draftGreenfieldVerifyGate();
  const specDebtLedger = createEmptyGreenfieldSpecDebtLedger();
  const evidenceGraph = draftGreenfieldEvidenceGraph({
    inputContract: options.inputContract,
    domainDraft,
    apiContractDraft,
    behaviorDraft,
    sliceQueueDraft,
  });
  const contractGraph = buildContractGraphFromEvidenceGraph(evidenceGraph);
  const reviewPackDraft = draftGreenfieldReviewPack({
    identity,
    inputContract: options.inputContract,
    requirementsContent,
    technicalSolutionContent,
    domainDraft,
    apiContractDraft,
    behaviorDraft,
    sliceQueueDraft,
  });
  const aiImplementHandoff = draftGreenfieldAiImplementHandoff({
    identity,
    apiContractDraft,
    sliceQueueDraft,
    evidenceGraph,
    contractGraph,
    reviewPackDraft,
  });
  const changeMainlineHandoff = buildGreenfieldChangeMainlineHandoff({
    sliceQueueDraft,
    reviewPackDraft,
    aiImplementHandoff,
  });
  writeAsset({
    root,
    relativePath: "jiproject/project.yaml",
    content: renderProjectYaml(identity, options.inputContract),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: "jiproject/glossary.yaml",
    content: renderGlossaryYaml(options.inputContract, domainDraft),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: "jiproject/context-map.yaml",
    content: renderContextMapYaml(options.inputContract, domainDraft),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: "jiproject/constraints.yaml",
    content: renderConstraintsYaml(options.inputContract),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/source-documents.yaml",
    content: renderSourceDocumentsManifest(options.inputContract),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/initialization-summary.md",
    content: renderInitializationSummary(identity, options.inputContract, apiContractDraft, behaviorDraft, sliceQueueDraft, verifyGateDraft, evidenceGraph, reviewPackDraft, aiImplementHandoff, changeMainlineHandoff),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/open-decisions.md",
    content: renderOpenDecisions(options.inputContract, behaviorDraft, sliceQueueDraft),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/baselines/current.yaml",
    content: renderCurrentBaseline(identity, options.inputContract, domainDraft, apiContractDraft, behaviorDraft, sliceQueueDraft, verifyGateDraft, reviewPackDraft, aiImplementHandoff, changeMainlineHandoff),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/spec-debt/ledger.yaml",
    content: renderGreenfieldSpecDebtLedger(specDebtLedger),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/evidence/evidence-graph.json",
    content: `${JSON.stringify(evidenceGraph, null, 2)}\n`,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/evidence/evidence-graph-summary.md",
    content: renderGreenfieldEvidenceGraphSummary(evidenceGraph),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: contractGraphPath(),
    content: `${JSON.stringify(contractGraph, null, 2)}\n`,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/ai-implement-handoff.md",
    content: aiImplementHandoff.markdown,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/change-mainline-handoff.json",
    content: `${JSON.stringify(changeMainlineHandoff, null, 2)}\n`,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/greenfield/change-mainline-handoff.md",
    content: renderGreenfieldChangeMainlineHandoffMarkdown(changeMainlineHandoff),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/evidence/ratchet-classifications.yaml",
    content: renderRatchetClassificationsYaml(),
    force,
    result,
  });
  writeReviewPackAssets(root, reviewPackDraft, force, result);
  writeDomainAssets(root, domainDraft, sliceQueueDraft, force, result);
  writeApiContractAssets(root, apiContractDraft, force, result);
  writeBehaviorAssets(root, behaviorDraft, force, result);
  writeSliceQueueAssets(root, sliceQueueDraft, force, result);
  writeVerifyGateAssets(root, verifyGateDraft, force, result);
  writeBundledSupportAssets(root, force, result);

  return result;
}

function writeAsset(options: WriteAssetOptions): void {
  const target = path.join(options.root, options.relativePath);
  ensureDirectory(options.root, path.dirname(options.relativePath), options.result);

  if (fs.existsSync(target) && !options.force) {
    options.result.skippedFiles.push(normalizePath(target));
    return;
  }

  fs.writeFileSync(target, options.content, "utf-8");
  options.result.writtenFiles.push(normalizePath(target));
}

function ensureDirectory(root: string, relativePath: string, result: GreenfieldProjectAssetResult): void {
  const target = path.join(root, relativePath);
  if (fs.existsSync(target)) {
    return;
  }

  fs.mkdirSync(target, { recursive: true });
  result.createdDirectories.push(normalizePath(target));
}

function readRequiredSource(filePath: string | undefined, label: string): string {
  if (!filePath || !fs.existsSync(filePath)) {
    throw new Error(`Cannot write Greenfield assets because ${label} source document is missing.`);
  }

  return fs.readFileSync(filePath, "utf-8");
}

function renderProjectYaml(identity: { id: string; name: string }, inputContract: GreenfieldInputContract): string {
  return dumpYaml({
    id: identity.id,
    name: identity.name,
    version: "0.1.0",
    delivery_model: "greenfield-initialization",
    input_mode: inputContract.mode,
    source_documents: {
      requirements: REQUIREMENTS_TARGET,
      technical_solution: TECHNICAL_SOLUTION_TARGET,
    },
    source_quality: {
      requirements: inputContract.requirements.status,
      technical_solution: inputContract.technicalSolution.status,
    },
    global_gates: [
      "source_documents_loaded",
      "contracts_validated",
      "verify_policy_ready",
      "ci_verify_gate",
      "review_passed",
    ],
  });
}

function renderGlossaryYaml(inputContract: GreenfieldInputContract, domainDraft: GreenfieldDomainDraft): string {
  return dumpYaml({
    terms: domainDraft.terms.map((term) => ({
      id: term.id,
      term: term.term,
      definition: term.definition,
      contexts: term.contexts,
      source: term.source,
      source_requirement_ids: term.sourceRequirementIds,
    })),
    open_decisions: [
      ...domainDraft.openDecisions,
      ...inputContract.openDecisions,
    ],
  });
}

function renderContextMapYaml(inputContract: GreenfieldInputContract, domainDraft: GreenfieldDomainDraft): string {
  return dumpYaml({
    contexts: domainDraft.contexts.map((context) => ({
      id: context.id,
      name: context.name,
      type: context.type,
      description: context.purpose,
      source_confidence: context.sourceConfidence,
      source_requirement_ids: context.sourceRequirementIds,
    })),
    relations: domainDraft.relations,
    source_confidence: inputContract.technicalSolution.status === "missing" ? "inferred" : "technical_solution",
    open_decisions: [
      ...domainDraft.openDecisions,
      ...inputContract.openDecisions,
    ],
  });
}

function renderConstraintsYaml(inputContract: GreenfieldInputContract): string {
  return dumpYaml({
    architecture: inputContract.technicalSolution.status === "missing"
      ? [
          {
            id: "CON-ARCH-001",
            rule: "Architecture constraints must be clarified because no technical solution was provided.",
            source_confidence: "inferred",
          },
        ]
      : [],
    delivery: [
      {
        id: "CON-DEL-001",
        rule: "All accepted work must remain traceable to requirements and tests.",
        source_confidence: "requirements",
      },
      {
        id: "CON-DEL-002",
        rule: "Inferred assets must be reviewed before release baseline.",
        source_confidence: "requirements",
      },
    ],
    quality: [],
    open_decisions: inputContract.openDecisions,
  });
}

function renderSourceDocumentsManifest(inputContract: GreenfieldInputContract): string {
  return dumpYaml({
    source_documents: {
      requirements: {
        path: REQUIREMENTS_TARGET,
        original_path: inputContract.requirements.path,
        role: "product_requirements",
        status: inputContract.requirements.status,
        checksum: inputContract.requirements.checksum,
        requirement_ids: inputContract.requirements.requirementIds ?? [],
        anchors: inputContract.requirements.anchors?.map((anchor) => ({
          id: anchor.id,
          kind: anchor.kind,
          path: REQUIREMENTS_TARGET,
          line: anchor.line,
          paragraph_id: anchor.paragraphId,
          excerpt: anchor.excerpt,
          checksum: anchor.checksum,
        })) ?? [],
      },
      technical_solution: {
        path: TECHNICAL_SOLUTION_TARGET,
        original_path: inputContract.technicalSolution.path,
        role: "technical_solution",
        status: inputContract.technicalSolution.status,
        checksum: inputContract.technicalSolution.checksum,
        anchors: inputContract.technicalSolution.anchors?.map((anchor) => ({
          id: anchor.id,
          kind: anchor.kind,
          path: TECHNICAL_SOLUTION_TARGET,
          line: anchor.line,
          paragraph_id: anchor.paragraphId,
          excerpt: anchor.excerpt,
          checksum: anchor.checksum,
        })) ?? [],
      },
    },
    input_mode: inputContract.mode,
    input_status: inputContract.status,
    blocking_issues: inputContract.blockingIssues,
    warnings: inputContract.warnings,
    open_decisions: inputContract.openDecisions,
    generated_at: new Date().toISOString(),
  });
}

function renderInitializationSummary(
  identity: { id: string; name: string },
  inputContract: GreenfieldInputContract,
  apiContractDraft: GreenfieldApiContractDraft,
  behaviorDraft: GreenfieldBehaviorDraft,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
  verifyGateDraft: GreenfieldVerifyGateDraft,
  evidenceGraph: GreenfieldEvidenceGraph,
  reviewPackDraft: GreenfieldReviewPackDraft,
  aiImplementHandoff: GreenfieldAiImplementHandoff,
  changeMainlineHandoff: GreenfieldChangeMainlineHandoff,
): string {
  return [
    `# ${identity.name} Greenfield Initialization`,
    "",
    "## Status",
    "",
    `- Input mode: \`${inputContract.mode}\``,
    `- Input status: \`${inputContract.status}\``,
    `- Requirements quality: \`${inputContract.requirements.status}\``,
    `- Technical solution quality: \`${inputContract.technicalSolution.status}\``,
    "",
    "## Created Project-Level Assets",
    "",
    "- `jiproject/project.yaml`",
    "- `jiproject/glossary.yaml`",
    "- `jiproject/context-map.yaml`",
    "- `jiproject/constraints.yaml`",
    "- `contexts/<context>/design/contracts.yaml`",
    "- `contexts/<context>/behavior/journeys.md`",
    "- `contexts/<context>/behavior/scenarios/*.feature`",
    "- `contexts/<context>/slices/<slice-id>/*`",
    "- `.spec/policy.yaml`",
    "- `.spec/ci/verify-gate.md`",
    "- `.github/workflows/jispec-verify.yml`",
    "- `.spec/evidence/evidence-graph.json`",
    "- `.spec/evidence/evidence-graph-summary.md`",
    "- `.spec/evidence/contract-graph.json`",
    "- `.spec/evidence/ratchet-classifications.yaml`",
    "- `.spec/spec-debt/ledger.yaml`",
    "- `.spec/greenfield/review-pack/executive-summary.md`",
    "- `.spec/greenfield/review-pack/review-record.yaml`",
    "- `.spec/greenfield/ai-implement-handoff.md`",
    "- `.spec/greenfield/change-mainline-handoff.json`",
    "- `.spec/greenfield/change-mainline-handoff.md`",
    "- `schemas/*.json`",
    "- `.spec/greenfield/source-documents.yaml`",
    "- `.spec/baselines/current.yaml`",
    "",
    "## Assumptions",
    "",
    `- Source document mode is \`${inputContract.mode}\`.`,
    `- Requirements quality is \`${inputContract.requirements.status}\`.`,
    `- Technical solution quality is \`${inputContract.technicalSolution.status}\`.`,
    "- Generated domain, contract, behavior, and slice assets are initialization drafts until reviewed.",
    "- Initial slices are thin implementation targets, not final product architecture.",
    "",
    "## Contract Open Questions",
    "",
    ...(apiContractDraft.openQuestions.length > 0
      ? apiContractDraft.openQuestions.map((question) => `- ${question}`)
      : ["- No API contract open questions recorded."]),
    "",
    "## Behavior Open Decisions",
    "",
    ...(behaviorDraft.openDecisions.length > 0
      ? behaviorDraft.openDecisions.map((decision) => `- ${decision}`)
      : ["- All known requirements mapped to generated behavior scenarios."]),
    "",
    "## Initial Slice Queue",
    "",
    ...(sliceQueueDraft.slices.length > 0
      ? sliceQueueDraft.slices.map((slice) => `- \`${slice.id}\`: ${slice.title}`)
      : ["- No initial slices generated."]),
    "",
    "## First Slice",
    "",
    ...(sliceQueueDraft.slices.length > 0
      ? [
          `- Slice: \`${sliceQueueDraft.slices[0].id}\``,
          `- Context: \`${sliceQueueDraft.slices[0].contextId}\``,
          `- Goal: ${sliceQueueDraft.slices[0].goal}`,
        ]
      : ["- No first slice is available because no initial slices were generated."]),
    "",
    "## Verify Gate",
    "",
    `- Policy rules: ${verifyGateDraft.policy.rules.map((rule) => `\`${rule.id}\``).join(", ")}`,
    "- CI workflow: `.github/workflows/jispec-verify.yml`",
    "- Local command: `jispec-cli verify --root . --policy .spec/policy.yaml`",
    "",
    "## Evidence Graph",
    "",
    `- Nodes: ${evidenceGraph.nodes.length}`,
    `- Edges: ${evidenceGraph.edges.length}`,
    `- Requirements with scenarios: ${evidenceGraph.summary.requirementCoverage.withScenario}/${evidenceGraph.summary.requirementCoverage.total}`,
    `- Requirements with contracts: ${evidenceGraph.summary.requirementCoverage.withContract}/${evidenceGraph.summary.requirementCoverage.total}`,
    `- Requirements with slices: ${evidenceGraph.summary.requirementCoverage.withSlice}/${evidenceGraph.summary.requirementCoverage.total}`,
    `- Requirements with tests: ${evidenceGraph.summary.requirementCoverage.withTest}/${evidenceGraph.summary.requirementCoverage.total}`,
    "",
    "## Initialization Review Pack",
    "",
    `- Review decisions: ${reviewPackDraft.summary.total}`,
    `- High confidence: ${reviewPackDraft.summary.highConfidence}`,
    `- Medium confidence: ${reviewPackDraft.summary.mediumConfidence}`,
    `- Low confidence: ${reviewPackDraft.summary.lowConfidence}`,
    `- Proposed blocking items: ${reviewPackDraft.summary.blockingProposed}`,
    `- Decision conflicts: ${reviewPackDraft.summary.conflicts}`,
    "- Review record: `.spec/greenfield/review-pack/review-record.yaml`",
    "- Human summary: `.spec/greenfield/review-pack/executive-summary.md`",
    "",
    "## AI Implement Handoff",
    "",
    `- Handoff pack: \`.spec/greenfield/ai-implement-handoff.md\``,
    `- Target slice: ${aiImplementHandoff.firstSliceId ? `\`${aiImplementHandoff.firstSliceId}\`` : "not available"}`,
    `- Dirty subgraph nodes: ${aiImplementHandoff.dirtySubgraphNodeIds.length}`,
    `- Contract focus: ${aiImplementHandoff.contractIds.map((contractId) => `\`${contractId}\``).join(", ") || "none"}`,
    `- Test focus: ${aiImplementHandoff.testIds.map((testId) => `\`${testId}\``).join(", ") || "none"}`,
    `- Blocking review decisions: ${aiImplementHandoff.blockingReviewDecisionIds.length}`,
    "",
    "## Change Mainline Handoff",
    "",
    "- Machine handoff: `.spec/greenfield/change-mainline-handoff.json`",
    "- Human handoff: `.spec/greenfield/change-mainline-handoff.md`",
    `- Status: \`${changeMainlineHandoff.status}\``,
    `- First change: ${changeMainlineHandoff.change_intent ? `\`${changeMainlineHandoff.change_intent.summary}\`` : "blocked"}`,
    `- Target slice: ${changeMainlineHandoff.first_slice ? `\`${changeMainlineHandoff.first_slice.slice_id}\`` : "not available"}`,
    "",
    "## Spec Debt",
    "",
    "- Open debts: 0",
    "- Expired debts: 0",
    "",
    "## Next Commands",
    "",
    "```bash",
    "jispec-cli verify --root . --policy .spec/policy.yaml",
    ...(changeMainlineHandoff.change_intent
      ? [
          `jispec-cli change "${changeMainlineHandoff.change_intent.summary}" --root . --slice ${changeMainlineHandoff.change_intent.slice_id} --context ${changeMainlineHandoff.change_intent.context_id} --change-type add --mode prompt`,
        ]
      : ["# Review .spec/greenfield/review-pack/review-record.yaml before creating a change session."]),
    "```",
    "",
    "## Next Task",
    "",
    "Review the initialization pack before handing the first slice to an AI implementer.",
    "",
  ].join("\n");
}

function renderOpenDecisions(
  inputContract: GreenfieldInputContract,
  behaviorDraft: GreenfieldBehaviorDraft,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
): string {
  const decisions = [
    ...inputContract.openDecisions,
    ...behaviorDraft.openDecisions,
    ...sliceQueueDraft.openDecisions,
  ];
  const renderedDecisions = decisions.length > 0
    ? decisions
    : ["No open decisions recorded during source document loading or behavior drafting."];

  return [
    "# Greenfield Open Decisions",
    "",
    ...renderedDecisions.map((decision) => `- ${decision}`),
    "",
  ].join("\n");
}

function renderCurrentBaseline(
  identity: { id: string; name: string },
  inputContract: GreenfieldInputContract,
  domainDraft: GreenfieldDomainDraft,
  apiContractDraft: GreenfieldApiContractDraft,
  behaviorDraft: GreenfieldBehaviorDraft,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
  verifyGateDraft: GreenfieldVerifyGateDraft,
  reviewPackDraft: GreenfieldReviewPackDraft,
  aiImplementHandoff: GreenfieldAiImplementHandoff,
  changeMainlineHandoff: GreenfieldChangeMainlineHandoff,
): string {
  return dumpYaml({
    baseline_id: `${identity.id}-current`,
    project_id: identity.id,
    project_name: identity.name,
    status: "initialized",
    input_mode: inputContract.mode,
    requirement_ids: inputContract.requirements.requirementIds ?? [],
    contexts: domainDraft.contexts.map((context) => context.id),
    contracts: apiContractDraft.contextContracts.flatMap((contextContract) =>
      contextContract.contracts.map((contract) => contract.id),
    ),
    scenarios: behaviorDraft.scenarioIds,
    slices: sliceQueueDraft.slices.map((slice) => slice.id),
    review_pack: {
      path: ".spec/greenfield/review-pack/review-record.yaml",
      decisions: reviewPackDraft.decisions.map((decision) => decision.decision_id),
      low_confidence_count: reviewPackDraft.summary.lowConfidence,
      blocking_proposed_count: reviewPackDraft.summary.blockingProposed,
      conflict_count: reviewPackDraft.summary.conflicts,
    },
    ai_implement_handoff: {
      path: ".spec/greenfield/ai-implement-handoff.md",
      target_slice: aiImplementHandoff.firstSliceId,
      dirty_subgraph_nodes: aiImplementHandoff.dirtySubgraphNodeIds,
      contract_focus: aiImplementHandoff.contractIds,
      scenario_focus: aiImplementHandoff.scenarioIds,
      test_focus: aiImplementHandoff.testIds,
      blocking_review_decisions: aiImplementHandoff.blockingReviewDecisionIds,
    },
    change_mainline_handoff: {
      path: ".spec/greenfield/change-mainline-handoff.json",
      summary_path: ".spec/greenfield/change-mainline-handoff.md",
      status: changeMainlineHandoff.status,
      target_slice: changeMainlineHandoff.first_slice?.slice_id,
      context_id: changeMainlineHandoff.first_slice?.context_id,
      change_summary: changeMainlineHandoff.change_intent?.summary,
      next_commands: changeMainlineHandoff.next_commands,
    },
    verify_policy: {
      path: ".spec/policy.yaml",
      rule_ids: verifyGateDraft.policy.rules.map((rule) => rule.id),
      facts_contract: verifyGateDraft.policy.requires?.facts_contract,
    },
    ci_gate: {
      provider: "github-actions",
      workflow: ".github/workflows/jispec-verify.yml",
      local_command: "jispec-cli verify --root . --policy .spec/policy.yaml",
    },
    assets: [
      "jiproject/project.yaml",
      "jiproject/glossary.yaml",
      "jiproject/context-map.yaml",
      "jiproject/constraints.yaml",
      ".spec/policy.yaml",
      ".spec/ci/verify-gate.md",
      ".spec/evidence/evidence-graph.json",
      ".spec/evidence/evidence-graph-summary.md",
      ".spec/evidence/contract-graph.json",
      ".spec/evidence/ratchet-classifications.yaml",
      ".spec/spec-debt/ledger.yaml",
      ".spec/greenfield/review-pack/executive-summary.md",
      ".spec/greenfield/review-pack/domain-review.md",
      ".spec/greenfield/review-pack/contract-review.md",
      ".spec/greenfield/review-pack/behavior-review.md",
      ".spec/greenfield/review-pack/slice-plan-review.md",
      ".spec/greenfield/review-pack/open-decisions.md",
      ".spec/greenfield/review-pack/review-record.yaml",
      ".spec/greenfield/ai-implement-handoff.md",
      ".spec/greenfield/change-mainline-handoff.json",
      ".spec/greenfield/change-mainline-handoff.md",
      ".github/workflows/jispec-verify.yml",
      ...domainDraft.contexts.map((context) => `contexts/${context.id}/context.yaml`),
      ...apiContractDraft.contextContracts.map((contextContract) => `contexts/${contextContract.contextId}/design/contracts.yaml`),
      ...behaviorDraft.contextBehaviors.map((contextBehavior) => `contexts/${contextBehavior.contextId}/behavior/journeys.md`),
      ...behaviorDraft.contextBehaviors.flatMap((contextBehavior) =>
        contextBehavior.scenarios.map((scenario) => `contexts/${contextBehavior.contextId}/behavior/scenarios/${scenario.id}.feature`),
      ),
      ...sliceQueueDraft.slices.map((slice) => `contexts/${slice.contextId}/slices/${slice.id}/slice.yaml`),
      ...BUNDLED_SCHEMA_FILES.map((fileName) => `schemas/${fileName}`),
    ],
  });
}

function renderRatchetClassificationsYaml(): string {
  return dumpYaml({
    classifications: [],
    allowed_states: [
      "ignored",
      "experimental",
      "intentional",
    ],
    note: "Use this file to classify implementation facts that are intentionally outside the Greenfield Evidence Graph.",
  });
}

function writeReviewPackAssets(
  root: string,
  reviewPackDraft: GreenfieldReviewPackDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  const assets = [
    {
      relativePath: ".spec/greenfield/review-pack/executive-summary.md",
      content: reviewPackDraft.executiveSummaryMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/domain-review.md",
      content: reviewPackDraft.domainReviewMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/contract-review.md",
      content: reviewPackDraft.contractReviewMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/behavior-review.md",
      content: reviewPackDraft.behaviorReviewMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/slice-plan-review.md",
      content: reviewPackDraft.slicePlanReviewMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/open-decisions.md",
      content: reviewPackDraft.openDecisionsMarkdown,
    },
    {
      relativePath: ".spec/greenfield/review-pack/review-record.yaml",
      content: reviewPackDraft.reviewRecordYaml,
    },
  ];

  for (const asset of assets) {
    writeAsset({
      root,
      relativePath: asset.relativePath,
      content: asset.content,
      force,
      result,
    });
  }
}

function writeDomainAssets(
  root: string,
  domainDraft: GreenfieldDomainDraft,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  for (const contextDomain of domainDraft.contextDomains) {
    const contextId = contextDomain.context.id;
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/context.yaml`,
      content: renderContextYaml(contextDomain, sliceQueueDraft),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/domain/ubiquitous-language.yaml`,
      content: renderUbiquitousLanguageYaml(contextDomain),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/domain/entities.yaml`,
      content: renderEntitiesYaml(contextDomain),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/domain/events.yaml`,
      content: renderEventsYaml(contextDomain),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/domain/invariants.yaml`,
      content: renderInvariantsYaml(contextDomain),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `contexts/${contextId}/domain/value-objects.yaml`,
      content: renderValueObjectsYaml(contextDomain),
      force,
      result,
    });
  }
}

function renderContextYaml(
  contextDomain: GreenfieldContextDomainDraft,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
): string {
  const context = contextDomain.context;
  return dumpYaml({
    id: context.id,
    name: context.name,
    owner: context.owner,
    purpose: context.purpose,
    upstream_contexts: context.upstreamContexts,
    downstream_contexts: context.downstreamContexts,
    active_slices: sliceQueueDraft.slices
      .filter((slice) => slice.contextId === context.id)
      .map((slice) => slice.id),
    source_confidence: context.sourceConfidence,
    source_requirement_ids: context.sourceRequirementIds,
  });
}

function renderUbiquitousLanguageYaml(contextDomain: GreenfieldContextDomainDraft): string {
  return dumpYaml({
    terms: contextDomain.terms.map((term) => ({
      id: `${contextDomain.context.id.toUpperCase()}-${term.id}`,
      term: term.term,
      definition: term.definition,
      source_requirement_ids: term.sourceRequirementIds,
    })),
  });
}

function renderEntitiesYaml(contextDomain: GreenfieldContextDomainDraft): string {
  return dumpYaml({
    entities: contextDomain.entities.map((entity) => ({
      id: entity.id,
      name: entity.name,
      description: entity.description,
      source_requirement_ids: entity.sourceRequirementIds,
    })),
  });
}

function renderEventsYaml(contextDomain: GreenfieldContextDomainDraft): string {
  return dumpYaml({
    events: contextDomain.events.map((event) => ({
      id: event.id,
      name: event.name,
      description: event.description,
      source_requirement_ids: event.sourceRequirementIds,
    })),
  });
}

function renderInvariantsYaml(contextDomain: GreenfieldContextDomainDraft): string {
  return dumpYaml({
    invariants: contextDomain.invariants.map((invariant) => ({
      id: invariant.id,
      statement: invariant.statement,
      source_requirement_id: invariant.sourceRequirementId,
    })),
  });
}

function renderValueObjectsYaml(contextDomain: GreenfieldContextDomainDraft): string {
  return dumpYaml({
    value_objects: contextDomain.valueObjects.map((valueObject) => ({
      id: valueObject.id,
      name: valueObject.name,
      description: valueObject.description,
      source_requirement_ids: valueObject.sourceRequirementIds,
    })),
  });
}

function writeApiContractAssets(
  root: string,
  apiContractDraft: GreenfieldApiContractDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  for (const contextContract of apiContractDraft.contextContracts) {
    writeAsset({
      root,
      relativePath: `contexts/${contextContract.contextId}/design/contracts.yaml`,
      content: renderContractsYaml(contextContract.contracts),
      force,
      result,
    });
  }
}

function renderContractsYaml(contracts: GreenfieldApiContractDraft["contextContracts"][number]["contracts"]): string {
  return dumpYaml({
    contracts: contracts.map((contract) => ({
      id: contract.id,
      name: contract.name,
      direction: contract.direction,
      ...(contract.sourceContext ? { source_context: contract.sourceContext } : {}),
      source_confidence: contract.sourceConfidence,
      source_requirement_ids: contract.sourceRequirementIds,
      open_questions: contract.openQuestions,
      fields: contract.fields,
    })),
  });
}

function writeBehaviorAssets(
  root: string,
  behaviorDraft: GreenfieldBehaviorDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  for (const contextBehavior of behaviorDraft.contextBehaviors) {
    writeAsset({
      root,
      relativePath: `contexts/${contextBehavior.contextId}/behavior/journeys.md`,
      content: contextBehavior.journeysMarkdown,
      force,
      result,
    });

    for (const scenario of contextBehavior.scenarios) {
      writeAsset({
        root,
        relativePath: `contexts/${contextBehavior.contextId}/behavior/scenarios/${scenario.id}.feature`,
        content: renderScenarioFeature(scenario),
        force,
        result,
      });
    }
  }
}

function writeSliceQueueAssets(
  root: string,
  sliceQueueDraft: GreenfieldSliceQueueDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  const now = new Date().toISOString();
  for (const slice of sliceQueueDraft.slices) {
    const sliceRoot = `contexts/${slice.contextId}/slices/${slice.id}`;
    writeAsset({
      root,
      relativePath: `${sliceRoot}/slice.yaml`,
      content: renderSliceYaml(slice, now),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/requirements.md`,
      content: renderSliceRequirements(slice),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/design.md`,
      content: renderSliceDesign(slice),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/behaviors.feature`,
      content: renderSliceBehaviorsFeature(slice),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/test-spec.yaml`,
      content: renderSliceTestSpec(slice),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/tasks.yaml`,
      content: renderSliceTasks(slice, now),
      force,
      result,
    });
    writeAsset({
      root,
      relativePath: `${sliceRoot}/trace.yaml`,
      content: renderSliceTrace(slice),
      force,
      result,
    });
  }
}

function writeVerifyGateAssets(
  root: string,
  verifyGateDraft: GreenfieldVerifyGateDraft,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  writeAsset({
    root,
    relativePath: ".spec/policy.yaml",
    content: renderGreenfieldVerifyPolicy(verifyGateDraft.policy),
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".spec/ci/verify-gate.md",
    content: verifyGateDraft.gateReadme,
    force,
    result,
  });
  writeAsset({
    root,
    relativePath: ".github/workflows/jispec-verify.yml",
    content: verifyGateDraft.ciWorkflow,
    force,
    result,
  });
}

function writeBundledSupportAssets(root: string, force: boolean, result: GreenfieldProjectAssetResult): void {
  for (const fileName of BUNDLED_SCHEMA_FILES) {
    writeBundledAsset(root, `schemas/${fileName}`, force, result);
  }

  for (const fileName of BUNDLED_AGENT_FILES) {
    writeBundledAsset(root, `agents/${fileName}`, force, result);
  }
}

function writeBundledAsset(
  root: string,
  relativePath: string,
  force: boolean,
  result: GreenfieldProjectAssetResult,
): void {
  const source = path.join(getBundledAssetRoot(), relativePath);
  if (!fs.existsSync(source)) {
    throw new Error(`Cannot write Greenfield support asset because bundled file is missing: ${source}`);
  }

  writeAsset({
    root,
    relativePath,
    content: fs.readFileSync(source, "utf-8"),
    force,
    result,
  });
}

function getBundledAssetRoot(): string {
  return path.resolve(__dirname, "..", "..", "..");
}

function renderMissingTechnicalSolutionPlaceholder(inputContract: GreenfieldInputContract): string {
  return [
    "# Technical Solution Placeholder",
    "",
    "No technical solution document was provided during Greenfield initialization.",
    "",
    "This placeholder keeps `jiproject/project.yaml` source document references stable.",
    "Replace it with a real technical solution before release baseline.",
    "",
    "## Open Decisions",
    "",
    ...inputContract.openDecisions.map((decision) => `- ${decision}`),
    "",
  ].join("\n");
}

function inferProjectIdentity(requirementsContent: string, root: string): { id: string; name: string } {
  const title = requirementsContent
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line.startsWith("# "));
  const rawName = title ? title.replace(/^#+\s*/, "").replace(/\s+Requirements$/i, "") : path.basename(root);
  const name = titleCase(rawName) || "Greenfield Project";
  const id = slugifyProjectId(name) || "greenfield-project";
  return { id, name };
}

function slugifyProjectId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
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
