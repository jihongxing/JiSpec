import fs from "node:fs";
import path from "node:path";

export type PilotAdoptionStepId =
  | "install"
  | "first_run"
  | "first_baseline"
  | "ci_verify"
  | "console_governance"
  | "privacy_report"
  | "doctor_pilot";

export type PilotAdoptionStepKind =
  | "setup"
  | "read_only_guide"
  | "mainline_gate"
  | "governance_companion";

export interface PilotProductPackageOptions {
  root: string;
  outPath?: string;
  generatedAt?: string;
}

export interface PilotProductPackageResult {
  root: string;
  packagePath: string;
  markdownPath: string;
  package: PilotProductPackage;
}

export interface PilotProductPackage {
  schemaVersion: 1;
  kind: "jispec-pilot-product-package";
  generatedAt: string;
  root: string;
  contract: {
    packageContractVersion: 1;
    adoptionPathVersion: 1;
  };
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    cloudTokenRequired: false;
    replacesVerify: false;
    replacesDoctorPilot: false;
    generatedFromLocalArtifactsOnly: true;
  };
  summary: {
    readyForPilot: boolean;
    completedStepCount: number;
    totalStepCount: number;
    blockerCount: number;
    mainlineGateCount: number;
    governanceCompanionCount: number;
  };
  adoptionPath: PilotAdoptionStep[];
  blockers: PilotAdoptionBlocker[];
  docs: Array<{
    path: string;
    role: "install" | "quickstart" | "legacy_takeover" | "greenfield" | "ci" | "console" | "privacy" | "pilot_gate";
  }>;
}

export interface PilotAdoptionStep {
  id: PilotAdoptionStepId;
  title: string;
  kind: PilotAdoptionStepKind;
  status: "complete" | "missing" | "attention";
  command: string;
  ownerAction: string;
  evidence: string[];
  docs: string[];
  writesLocalArtifacts: boolean;
  mainlineAuthority: boolean;
}

export interface PilotAdoptionBlocker {
  stepId: PilotAdoptionStepId;
  ownerAction: string;
  nextCommand: string;
  sourceArtifacts: string[];
}

const DEFAULT_PACKAGE_PATH = ".spec/pilot/package.json";

export function buildPilotProductPackage(options: PilotProductPackageOptions): PilotProductPackage {
  const root = path.resolve(options.root);
  const steps = buildAdoptionPath(root);
  const blockers = steps
    .filter((step) => step.status !== "complete")
    .map((step) => ({
      stepId: step.id,
      ownerAction: step.ownerAction,
      nextCommand: step.command,
      sourceArtifacts: step.evidence,
    }));

  return {
    schemaVersion: 1,
    kind: "jispec-pilot-product-package",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    root: normalizePath(root),
    contract: {
      packageContractVersion: 1,
      adoptionPathVersion: 1,
    },
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      cloudTokenRequired: false,
      replacesVerify: false,
      replacesDoctorPilot: false,
      generatedFromLocalArtifactsOnly: true,
    },
    summary: {
      readyForPilot: blockers.length === 0,
      completedStepCount: steps.filter((step) => step.status === "complete").length,
      totalStepCount: steps.length,
      blockerCount: blockers.length,
      mainlineGateCount: steps.filter((step) => step.kind === "mainline_gate").length,
      governanceCompanionCount: steps.filter((step) => step.kind === "governance_companion").length,
    },
    adoptionPath: steps,
    blockers,
    docs: [
      { path: "docs/install.md", role: "install" },
      { path: "docs/quickstart.md", role: "quickstart" },
      { path: "docs/first-takeover-walkthrough.md", role: "legacy_takeover" },
      { path: "docs/greenfield-walkthrough.md", role: "greenfield" },
      { path: "docs/ci-templates.md", role: "ci" },
      { path: "docs/console-governance-guide.md", role: "console" },
      { path: "docs/privacy-and-local-first.md", role: "privacy" },
      { path: "docs/pilot-readiness-checklist.md", role: "pilot_gate" },
    ],
  };
}

export function writePilotProductPackage(options: PilotProductPackageOptions): PilotProductPackageResult {
  const root = path.resolve(options.root);
  const packageValue = buildPilotProductPackage({ ...options, root });
  const packagePath = resolvePackagePath(root, options.outPath);
  const markdownPath = packagePath.replace(/\.json$/i, ".md");

  fs.mkdirSync(path.dirname(packagePath), { recursive: true });
  fs.writeFileSync(packagePath, `${JSON.stringify(packageValue, null, 2)}\n`, "utf-8");
  fs.writeFileSync(markdownPath, renderPilotProductPackageMarkdown(packageValue), "utf-8");

  return {
    root: normalizePath(root),
    packagePath: normalizePath(packagePath),
    markdownPath: normalizePath(markdownPath),
    package: packageValue,
  };
}

export function renderPilotProductPackageJSON(result: PilotProductPackageResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderPilotProductPackageText(result: PilotProductPackageResult): string {
  return [
    "Pilot product package written.",
    `Ready for pilot: ${result.package.summary.readyForPilot ? "yes" : "no"}`,
    `Completed steps: ${result.package.summary.completedStepCount}/${result.package.summary.totalStepCount}`,
    `Blockers: ${result.package.summary.blockerCount}`,
    `Package path: ${normalizePath(path.relative(result.root, result.packagePath))}`,
    `Markdown path: ${normalizePath(path.relative(result.root, result.markdownPath))}`,
    "Boundary: local package only; does not upload source, replace verify, or replace doctor pilot.",
  ].join("\n");
}

export function renderPilotProductPackageMarkdown(packageValue: PilotProductPackage): string {
  const lines = [
    "# JiSpec Pilot Product Package",
    "",
    `Generated at: ${packageValue.generatedAt}`,
    `Ready for pilot: ${packageValue.summary.readyForPilot ? "yes" : "no"}`,
    "",
    "## Boundary",
    "",
    "- Local-only package generated from existing JiSpec artifacts.",
    "- It does not upload source, require cloud tokens, replace `verify`, or replace `doctor pilot`.",
    "",
    "## Adoption Path",
    "",
  ];

  for (const step of packageValue.adoptionPath) {
    lines.push(`- ${step.title}: ${step.status}`);
    lines.push(`  Kind: ${labelStepKind(step.kind)}`);
    lines.push(`  Command: \`${step.command}\``);
    lines.push(`  Owner action: ${step.ownerAction}`);
  }

  lines.push(
    "",
    "## Mainline gates",
    "",
    "- `verify`, `ci:verify`, and `doctor pilot` are the gates that decide readiness.",
    "- Console, privacy, and this package are governance companions.",
    "",
    "## Governance companions",
    "",
    "- Console governance snapshot",
    "- Privacy report and redacted companions",
    "- Pilot product package",
    "",
  );

  return lines.join("\n");
}

function buildAdoptionPath(root: string): PilotAdoptionStep[] {
  return [
    buildInstallStep(root),
    buildFirstRunStep(root),
    buildFirstBaselineStep(root),
    buildCiVerifyStep(root),
    buildConsoleStep(root),
    buildPrivacyStep(root),
    buildDoctorPilotStep(root),
  ];
}

function buildInstallStep(root: string): PilotAdoptionStep {
  const packageJson = readJson(path.join(root, "package.json"));
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
  const complete = Boolean(scripts.jispec || scripts["jispec-cli"] || scripts.verify || scripts["ci:verify"] || packageJson?.bin);
  return step({
    id: "install",
    title: "Install local CLI entry",
    kind: "setup",
    status: complete ? "complete" : "missing",
    command: "npm install",
    ownerAction: complete ? "Local JiSpec entry is available." : "Install JiSpec and expose a local script or bin entry.",
    evidence: ["package.json"],
    docs: ["docs/install.md", "docs/quickstart.md"],
    writesLocalArtifacts: false,
    mainlineAuthority: false,
  });
}

function buildFirstRunStep(root: string): PilotAdoptionStep {
  return step({
    id: "first_run",
    title: "Run guided first-run",
    kind: "read_only_guide",
    status: "complete",
    command: "npm run jispec -- first-run --root .",
    ownerAction: "Use first-run to choose the next local adoption command for this repo state.",
    evidence: existingArtifacts(root, ["jiproject/project.yaml", ".spec/handoffs/bootstrap-takeover.json", ".spec/greenfield/change-mainline-handoff.json"]),
    docs: ["docs/quickstart.md"],
    writesLocalArtifacts: false,
    mainlineAuthority: false,
  });
}

function buildFirstBaselineStep(root: string): PilotAdoptionStep {
  const takeoverPath = ".spec/handoffs/bootstrap-takeover.json";
  const greenfieldPath = ".spec/baselines/current.yaml";
  const takeover = readJson(path.join(root, takeoverPath));
  const complete = takeover?.status === "committed" || fs.existsSync(path.join(root, greenfieldPath));
  return step({
    id: "first_baseline",
    title: "Commit first baseline",
    kind: "mainline_gate",
    status: complete ? "complete" : "missing",
    command: "npm run jispec -- first-run --root .",
    ownerAction: complete ? "First takeover or Greenfield baseline is present." : "Complete bootstrap adopt or Greenfield init before inviting pilot reviewers.",
    evidence: existingArtifacts(root, [takeoverPath, greenfieldPath]),
    docs: ["docs/first-takeover-walkthrough.md", "docs/greenfield-walkthrough.md"],
    writesLocalArtifacts: true,
    mainlineAuthority: true,
  });
}

function buildCiVerifyStep(root: string): PilotAdoptionStep {
  const reportPath = ".jispec-ci/verify-report.json";
  const packageJson = readJson(path.join(root, "package.json"));
  const scripts = isRecord(packageJson?.scripts) ? packageJson.scripts : {};
  const report = readJson(path.join(root, reportPath));
  const blocking = numberValue(report?.blockingIssueCount ?? report?.blocking_issue_count ?? report?.counts?.blocking);
  const complete = Boolean(scripts["ci:verify"]) && report !== undefined && report.verdict !== "FAIL_BLOCKING" && blocking === 0;
  return step({
    id: "ci_verify",
    title: "Run CI verify",
    kind: "mainline_gate",
    status: complete ? "complete" : "missing",
    command: "npm run ci:verify",
    ownerAction: complete ? "CI verify report is present without blocking issues." : "Wire and run the local CI verify wrapper until blocking issues are gone.",
    evidence: existingArtifacts(root, ["package.json", reportPath, ".jispec-ci/ci-summary.md", ".jispec-ci/verify-summary.md"]),
    docs: ["docs/ci-templates.md"],
    writesLocalArtifacts: true,
    mainlineAuthority: true,
  });
}

function buildConsoleStep(root: string): PilotAdoptionStep {
  const snapshotPath = ".spec/console/governance-snapshot.json";
  const snapshot = readJson(path.join(root, snapshotPath));
  const boundary = isRecord(snapshot?.boundary) ? snapshot.boundary : {};
  const complete = snapshot !== undefined &&
    boundary.sourceUploadRequired === false &&
    boundary.scansSourceCode === false &&
    boundary.replacesCliGate === false;
  return step({
    id: "console_governance",
    title: "Export Console governance snapshot",
    kind: "governance_companion",
    status: complete ? "complete" : "missing",
    command: "npm run jispec -- console export-governance --root .",
    ownerAction: complete ? "Console governance snapshot is available for reviewers." : "Export a read-only governance snapshot for pilot review.",
    evidence: existingArtifacts(root, [snapshotPath, ".spec/console/governance-snapshot.md"]),
    docs: ["docs/console-governance-guide.md"],
    writesLocalArtifacts: true,
    mainlineAuthority: false,
  });
}

function buildPrivacyStep(root: string): PilotAdoptionStep {
  const reportPath = ".spec/privacy/privacy-report.json";
  const report = readJson(path.join(root, reportPath));
  const highSeverity = numberValue(report?.summary?.highSeverityFindingCount);
  const complete = report !== undefined && highSeverity === 0;
  return step({
    id: "privacy_report",
    title: "Generate privacy report",
    kind: "governance_companion",
    status: complete ? "complete" : "missing",
    command: "npm run jispec -- privacy report --root .",
    ownerAction: complete ? "Privacy report is present without high severity findings." : "Generate or review the privacy report before sharing pilot artifacts.",
    evidence: existingArtifacts(root, [reportPath, ".spec/privacy/privacy-report.md", ".spec/privacy/redacted"]),
    docs: ["docs/privacy-and-local-first.md"],
    writesLocalArtifacts: true,
    mainlineAuthority: false,
  });
}

function buildDoctorPilotStep(root: string): PilotAdoptionStep {
  const priorSteps = [
    buildInstallStep(root),
    buildFirstBaselineStep(root),
    buildCiVerifyStep(root),
    buildConsoleStep(root),
    buildPrivacyStep(root),
  ];
  const complete = priorSteps.every((entry) => entry.status === "complete");
  return step({
    id: "doctor_pilot",
    title: "Run pilot readiness gate",
    kind: "mainline_gate",
    status: complete ? "complete" : "missing",
    command: "npm run pilot:ready",
    ownerAction: complete ? "Pilot readiness prerequisites are present; keep running this gate before sharing." : "Resolve package blockers, then run doctor pilot or pilot:ready.",
    evidence: existingArtifacts(root, [".spec/pilot/package.json"]),
    docs: ["docs/pilot-readiness-checklist.md"],
    writesLocalArtifacts: false,
    mainlineAuthority: true,
  });
}

function step(input: PilotAdoptionStep): PilotAdoptionStep {
  return input;
}

function resolvePackagePath(root: string, outPath?: string): string {
  const target = outPath ?? DEFAULT_PACKAGE_PATH;
  return path.isAbsolute(target) ? target : path.join(root, target);
}

function readJson(filePath: string): any | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf-8"));
  } catch {
    return undefined;
  }
}

function existingArtifacts(root: string, candidates: string[]): string[] {
  return candidates.filter((candidate) => fs.existsSync(path.join(root, candidate)));
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function labelStepKind(kind: PilotAdoptionStepKind): string {
  switch (kind) {
    case "mainline_gate":
      return "Mainline gate";
    case "governance_companion":
      return "Governance companion";
    case "read_only_guide":
      return "Read-only guide";
    case "setup":
      return "Setup";
  }
}

function isRecord(value: unknown): value is Record<string, any> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
