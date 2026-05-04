export type ConsoleReadModelFormat = "json" | "jsonl" | "yaml" | "markdown" | "lock";
export type ConsoleReadModelStability = "stable-machine-api" | "human-companion" | "local-contract";
export type ConsoleReadModelFreshness = "per-verify-run" | "project-state" | "release-snapshot" | "release-compare";
export type ConsoleGovernanceObjectId =
  | "policy_posture"
  | "waiver_lifecycle"
  | "spec_debt_ledger"
  | "contract_drift"
  | "release_baseline"
  | "verify_trend"
  | "takeover_quality_trend"
  | "implementation_mediation_outcomes"
  | "audit_events"
  | "approval_workflow"
  | "multi_repo_export"
  | "north_star_acceptance";

export interface ConsoleReadModelArtifact {
  id: string;
  pathPattern: string;
  producer: string;
  format: ConsoleReadModelFormat;
  stability: ConsoleReadModelStability;
  freshness: ConsoleReadModelFreshness;
  readModelUse: string;
  machineReadable: boolean;
  parseMarkdown: boolean;
  sourceUploadRequired: boolean;
}

export interface ConsoleReadModelContract {
  version: 1;
  boundary: {
    readOnly: true;
    replacesCliGate: false;
    sourceUploadRequired: false;
    localArtifactsAreSourceOfTruth: true;
  };
  artifacts: ConsoleReadModelArtifact[];
  governanceObjects: ConsoleGovernanceObjectContract[];
}

export interface ConsoleGovernanceObjectContract {
  id: ConsoleGovernanceObjectId;
  label: string;
  sourceArtifactIds: string[];
  missingState: "not_available_yet";
  automationInputs: "json_yaml_jsonl_only";
  markdownDisplayOnly: true;
  readModelUse: string;
}

export const CONSOLE_READ_MODEL_CONTRACT_VERSION = 1;

export const CONSOLE_READ_MODEL_ARTIFACTS: ConsoleReadModelArtifact[] = [
  {
    id: "ci-verify-report",
    pathPattern: ".jispec-ci/verify-report.json",
    producer: "ci:verify",
    format: "json",
    stability: "stable-machine-api",
    freshness: "per-verify-run",
    readModelUse: "CI verdict, issue counts, issue fingerprints, matched policy rules, modes, links, and provider context.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "ci-verify-summary",
    pathPattern: ".jispec-ci/verify-summary.md",
    producer: "ci:verify",
    format: "markdown",
    stability: "human-companion",
    freshness: "per-verify-run",
    readModelUse: "Human decision digest for mergeability, blockers, advisory debt, waiver effects, and next action.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "ci-summary",
    pathPattern: ".jispec-ci/ci-summary.md",
    producer: "ci:verify",
    format: "markdown",
    stability: "human-companion",
    freshness: "per-verify-run",
    readModelUse: "Provider-facing CI step summary. Console may display it, but must not parse it as a contract.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "local-verify-summary",
    pathPattern: ".spec/handoffs/verify-summary.md",
    producer: "verify",
    format: "markdown",
    stability: "human-companion",
    freshness: "per-verify-run",
    readModelUse: "Local human verify digest aligned with the CI verify summary language.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "verify-policy",
    pathPattern: ".spec/policy.yaml",
    producer: "policy migrate or Greenfield init",
    format: "yaml",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Team profile, facts contract requirement, Greenfield review gate settings, and verify policy rules.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "verify-waivers",
    pathPattern: ".spec/waivers/*.json",
    producer: "waiver create|revoke",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Auditable active, expired, revoked, and invalid waiver records with matcher, owner, reason, and lifecycle fields.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "verify-baseline",
    pathPattern: ".spec/baselines/verify-baseline.json",
    producer: "verify --write-baseline",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Historical verify issue baseline used to distinguish existing debt from new blockers.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "greenfield-current-baseline",
    pathPattern: ".spec/baselines/current.yaml",
    producer: "Greenfield init and explicit baseline adoption",
    format: "yaml",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Current Greenfield baseline for requirements, contexts, contracts, scenarios, slices, assets, and handoff refs.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "greenfield-spec-debt-ledger",
    pathPattern: ".spec/spec-debt/ledger.yaml",
    producer: "Greenfield review workflow and spec debt commands",
    format: "yaml",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Open, expired, repaid, and cancelled Greenfield spec debt with owner, reason, expiration, and repayment hint.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "bootstrap-spec-debt-records",
    pathPattern: ".spec/spec-debt/<session-id>/*.json",
    producer: "adopt --interactive",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Deferred takeover draft decisions and their source evidence.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "release-baseline",
    pathPattern: ".spec/baselines/releases/<version>.yaml",
    producer: "release snapshot",
    format: "yaml",
    stability: "local-contract",
    freshness: "release-snapshot",
    readModelUse: "Frozen release baseline with contract graph, static collector, policy snapshot, and tracked project assets.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "release-compare-report",
    pathPattern: ".spec/releases/compare/<from>-to-<to>/compare-report.json",
    producer: "release compare",
    format: "json",
    stability: "local-contract",
    freshness: "release-compare",
    readModelUse: "Release drift summary split into contract graph drift, static collector drift, and policy drift.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "release-compare-summary",
    pathPattern: ".spec/releases/compare/<from>-to-<to>/compare-report.md",
    producer: "release compare",
    format: "markdown",
    stability: "human-companion",
    freshness: "release-compare",
    readModelUse: "Human release comparison summary. Console may render it, but should read JSON for automation.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "release-drift-trend",
    pathPattern: ".spec/releases/drift-trend.json",
    producer: "release compare",
    format: "json",
    stability: "local-contract",
    freshness: "release-compare",
    readModelUse: "Release drift trend across compare reports, split into contract graph, static collector, and policy drift histories.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "release-drift-trend-summary",
    pathPattern: ".spec/releases/drift-trend.md",
    producer: "release compare",
    format: "markdown",
    stability: "human-companion",
    freshness: "release-compare",
    readModelUse: "Human release drift trend summary. Console may render it, but should read JSON for automation.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "multi-repo-governance-snapshot",
    pathPattern: ".spec/console/governance-snapshot.json",
    producer: "console export-governance",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Repo-level governance snapshot for future multi-repo Console aggregation across policy, waiver, debt, and drift posture.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "multi-repo-governance-summary",
    pathPattern: ".spec/console/governance-snapshot.md",
    producer: "console export-governance",
    format: "markdown",
    stability: "human-companion",
    freshness: "project-state",
    readModelUse: "Human companion summary for the exported repo-level governance snapshot.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "retakeover-metrics",
    pathPattern: ".spec/handoffs/retakeover-metrics.json",
    producer: "bootstrap retakeover regression",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Single-repository takeover quality scorecard, risk notes, feature overclaim risk, and next action.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "retakeover-pool-metrics",
    pathPattern: ".spec/handoffs/retakeover-pool-metrics.json",
    producer: "bootstrap retakeover regression pool",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Pool-level takeover quality trend across real and synthetic retakeover fixtures.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "value-report",
    pathPattern: ".spec/metrics/value-report.json",
    producer: "metrics value-report",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Repo-local ROI and adoption metrics: manual sorting reduction, surfaced risks, waiver/debt aging, and execute mediation stop points.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "implementation-handoff-packets",
    pathPattern: ".jispec/handoff/*.json",
    producer: "implement",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Implementation mediation outcomes, stop points, replay state, next-action owner, and external handoff requests.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "implementation-patch-mediation",
    pathPattern: ".jispec/implement/<session-id>/patch-mediation.json",
    producer: "implement --external-patch",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "External patch scope, apply, test, and verify intake records.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "policy-approvals",
    pathPattern: ".spec/approvals/*.json",
    producer: "policy approval record",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Structured local approval decisions for policy, waiver, release drift, and execute-default changes.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "audit-events",
    pathPattern: ".spec/audit/events.jsonl",
    producer: "governance commands",
    format: "jsonl",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Append-only local audit ledger for governance actions once audit events are enabled.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "north-star-acceptance",
    pathPattern: ".spec/north-star/acceptance.json",
    producer: "north-star acceptance",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Final local acceptance package for the north-star closeout. Console may display it, but must not treat it as a gate.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "north-star-acceptance-summary",
    pathPattern: ".spec/north-star/acceptance.md",
    producer: "north-star acceptance",
    format: "markdown",
    stability: "human-companion",
    freshness: "project-state",
    readModelUse: "Human companion for the final local acceptance package. Console may render it, but must not parse it as a machine API.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "north-star-scenario-packets",
    pathPattern: ".spec/north-star/scenarios/*.json",
    producer: "north-star acceptance",
    format: "json",
    stability: "local-contract",
    freshness: "project-state",
    readModelUse: "Per-scenario machine artifacts for the north-star acceptance suite. Console may display them, but must not elevate them into a gate.",
    machineReadable: true,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
  {
    id: "north-star-scenario-decisions",
    pathPattern: ".spec/north-star/scenarios/*-decision.md",
    producer: "north-star acceptance",
    format: "markdown",
    stability: "human-companion",
    freshness: "project-state",
    readModelUse: "Per-scenario human decision packets for north-star acceptance. Markdown remains display-only.",
    machineReadable: false,
    parseMarkdown: false,
    sourceUploadRequired: false,
  },
];

export const CONSOLE_GOVERNANCE_OBJECTS: ConsoleGovernanceObjectContract[] = [
  {
    id: "policy_posture",
    label: "Policy posture",
    sourceArtifactIds: ["verify-policy"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show whether a local verify policy exists, its facts contract, team owner, reviewers, and rule count.",
  },
  {
    id: "waiver_lifecycle",
    label: "Waiver lifecycle",
    sourceArtifactIds: ["verify-waivers", "ci-verify-report"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show active, revoked, expired, invalid, matched, and unmatched waiver posture without applying waivers.",
  },
  {
    id: "spec_debt_ledger",
    label: "Spec debt ledger",
    sourceArtifactIds: ["greenfield-spec-debt-ledger", "bootstrap-spec-debt-records"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show known Greenfield and bootstrap spec debt records without scanning source files.",
  },
  {
    id: "contract_drift",
    label: "Contract drift",
    sourceArtifactIds: ["release-compare-report", "release-drift-trend"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show release drift history and latest compare status from machine-readable trend and compare reports.",
  },
  {
    id: "release_baseline",
    label: "Release baseline",
    sourceArtifactIds: ["release-baseline"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show frozen release baselines available for governance review.",
  },
  {
    id: "verify_trend",
    label: "Verify trend",
    sourceArtifactIds: ["ci-verify-report", "verify-baseline"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show current verify verdict and baseline availability; Console does not recompute verify.",
  },
  {
    id: "takeover_quality_trend",
    label: "Takeover quality trend",
    sourceArtifactIds: ["retakeover-metrics", "retakeover-pool-metrics", "value-report"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show retakeover quality scorecards and next actions from generated metrics.",
  },
  {
    id: "implementation_mediation_outcomes",
    label: "Implementation mediation outcomes",
    sourceArtifactIds: ["implementation-handoff-packets", "implementation-patch-mediation"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show execute/implement outcomes, stop points, replayability, and patch mediation posture.",
  },
  {
    id: "audit_events",
    label: "Audit events",
    sourceArtifactIds: ["audit-events"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show local governance event ledger when audit events are enabled.",
  },
  {
    id: "approval_workflow",
    label: "Approval workflow",
    sourceArtifactIds: ["verify-policy", "policy-approvals", "verify-waivers", "release-compare-report"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show approval missing, stale, or satisfied for policy, waiver, release drift, and execute-default changes.",
  },
  {
    id: "multi_repo_export",
    label: "Multi-repo export",
    sourceArtifactIds: ["multi-repo-governance-snapshot"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show the exported repo-level governance snapshot intended for future multi-repo aggregation.",
  },
  {
    id: "north_star_acceptance",
    label: "North Star acceptance",
    sourceArtifactIds: ["north-star-acceptance", "north-star-scenario-packets"],
    missingState: "not_available_yet",
    automationInputs: "json_yaml_jsonl_only",
    markdownDisplayOnly: true,
    readModelUse: "Show the final local acceptance package and scenario packet availability without making it a gate.",
  },
];

export function getConsoleReadModelContract(): ConsoleReadModelContract {
  return {
    version: CONSOLE_READ_MODEL_CONTRACT_VERSION,
    boundary: {
      readOnly: true,
      replacesCliGate: false,
      sourceUploadRequired: false,
      localArtifactsAreSourceOfTruth: true,
    },
    artifacts: CONSOLE_READ_MODEL_ARTIFACTS,
    governanceObjects: CONSOLE_GOVERNANCE_OBJECTS,
  };
}

export function getConsoleMachineReadableArtifacts(): ConsoleReadModelArtifact[] {
  return CONSOLE_READ_MODEL_ARTIFACTS.filter((artifact) => artifact.machineReadable);
}
