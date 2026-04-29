export type ConsoleReadModelFormat = "json" | "yaml" | "markdown" | "lock";
export type ConsoleReadModelStability = "stable-machine-api" | "human-companion" | "local-contract";
export type ConsoleReadModelFreshness = "per-verify-run" | "project-state" | "release-snapshot" | "release-compare";

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
  };
}

export function getConsoleMachineReadableArtifacts(): ConsoleReadModelArtifact[] {
  return CONSOLE_READ_MODEL_ARTIFACTS.filter((artifact) => artifact.machineReadable);
}
