import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";

export const ABSOLUTE_TERMINAL_FROZEN_SURFACES = [
  "V1 mainline command surface",
  "doctor mainline",
  "verify",
  "verify --fast",
  "ci:verify",
  "doctor runtime",
  "doctor pilot",
  "doctor global",
  "console export-governance",
  "console aggregate-governance",
  "north-star acceptance",
  "runtime-extended regression suites",
] as const;

export const ABSOLUTE_TERMINAL_RETAINED_DOCS = [
  "docs/README.md",
  "docs/doc-lifecycle.md",
  "docs/getting-started/README.md",
  "docs/user-guide/README.md",
  "docs/reference/README.md",
  "docs/architecture/README.md",
  "docs/development/README.md",
  "docs/install.md",
  "docs/quickstart.md",
  "docs/execute-default-guide.md",
  "docs/console-governance-guide.md",
  "docs/external-coding-tool-adapters.md",
  "docs/contract-source-adapters.md",
  "docs/requirement-evolution-workflow.md",
  "docs/audit-ledger.md",
  "docs/ci-templates.md",
  "docs/integrations.md",
  "docs/privacy-and-local-first.md",
  "docs/greenfield-walkthrough.md",
  "docs/pilot-product-package.md",
  "docs/getting-started/first-takeover-walkthrough.md",
  "docs/user-guide/takeover-guide.md",
  "docs/architecture/north-star.md",
  "docs/architecture/north-star-acceptance.md",
  "docs/architecture/ide-trajectory.md",
  "docs/development/collaboration-surface-freeze.md",
  "docs/development/pilot-readiness-checklist.md",
  "docs/reference/v1-mainline-stable-contract.md",
  "docs/reference/greenfield-input-contract.md",
  "docs/reference/console-read-model-contract.md",
  "docs/reference/truth-contract-and-canonical-encoding.md",
  "docs/architecture/absolute-terminal-checklist.md",
] as const;

export const ABSOLUTE_TERMINAL_RETAINED_SURFACES = [
  ...ABSOLUTE_TERMINAL_FROZEN_SURFACES,
  ...ABSOLUTE_TERMINAL_RETAINED_DOCS,
] as const;

export const ABSOLUTE_TERMINAL_DELETED_SURFACES = [
  "docs/development/releases/v0.1.0.md",
  "docs/development/superpowers-discipline-layer.md",
  "tools/jispec/cache-manager-old.ts",
  "Legacy CLI compatibility surface",
  "doctor v1 alias",
  "validate alias",
  "validate:repo script",
  "check:jispec script",
] as const;

export interface AbsoluteTerminalBoundaryReport {
  ready: boolean;
  frozenSurfaces: readonly string[];
  retainedSurfaces: readonly string[];
  deletedSurfaces: readonly string[];
  details: string[];
  issues: string[];
}

export function evaluateAbsoluteTerminalBoundary(root: string): AbsoluteTerminalBoundaryReport {
  const checklistPath = path.join(root, "docs", "architecture", "absolute-terminal-checklist.md");
  const lifecyclePath = path.join(root, "docs", "doc-lifecycle.md");
  const architectureIndexPath = path.join(root, "docs", "architecture", "README.md");
  const docsIndexPath = path.join(root, "docs", "README.md");
  const stableContractPath = path.join(root, "docs", "reference", "v1-mainline-stable-contract.md");
  const cliPath = path.join(root, "tools", "jispec", "cli.ts");
  const cliHelp = runCliHelp(root);
  const doctorPath = path.join(root, "tools", "jispec", "doctor.ts");
  const packageJsonPath = path.join(root, "package.json");

  const files = {
    checklist: readText(checklistPath),
    lifecycle: readText(lifecyclePath),
    architectureIndex: readText(architectureIndexPath),
    docsIndex: readText(docsIndexPath),
    stableContract: readText(stableContractPath),
    cli: readText(cliPath),
    doctor: readText(doctorPath),
    packageJson: readText(packageJsonPath),
  };

  const details: string[] = [];
  const issues: string[] = [];

  if (!files.checklist) {
    issues.push("Absolute terminal checklist document is missing.");
  } else {
    details.push("Absolute terminal checklist document present.");
    if (!files.checklist.includes("保留") || !files.checklist.includes("已删除")) {
      issues.push("Absolute terminal checklist does not define the retained/deleted sections.");
    }
  }

  if (!files.lifecycle) {
    issues.push("Doc lifecycle map is missing.");
  } else {
    details.push("Doc lifecycle map present.");
    if (
      !files.lifecycle.includes("直接保留") ||
      !files.lifecycle.includes("兼容别名") ||
      !files.lifecycle.includes("已删除")
    ) {
      issues.push("Doc lifecycle map does not separate retained docs, compatibility aliases, and deleted docs.");
    }
  }

  if (!files.architectureIndex || !files.docsIndex) {
    issues.push("Docs navigation pages are missing.");
  } else {
    details.push("Docs navigation pages present.");
  }

  if (!files.stableContract) {
    issues.push("V1 stable contract document is missing.");
  } else {
    if (!files.stableContract.includes("doctor mainline") || files.stableContract.includes("legacy `slice/context")) {
      issues.push("Stable contract does not clearly describe the V1 mainline as the only live CLI contract.");
    } else {
      details.push("Stable contract describes only the V1 mainline as live CLI contract.");
    }
  }

  if (!files.cli) {
    issues.push("CLI source is missing.");
  } else if (
    !files.cli.includes("Current CI wrapper:") ||
    files.cli.includes("doctor v1") ||
    files.cli.includes("validate:repo") ||
    files.cli.includes("check:jispec") ||
    files.cli.includes("jispec-cli validate")
  ) {
    issues.push("CLI help text still exposes retired aliases.");
  } else {
    details.push("CLI help text removed retired aliases.");
  }

  if (!cliHelp.ok) {
    issues.push("CLI help command failed.");
  } else if (
    cliHelp.stdout.includes("Legacy compatibility surface:") ||
    cliHelp.stdout.includes("jispec-cli slice ...") ||
    cliHelp.stdout.includes("jispec-cli context ...") ||
    cliHelp.stdout.includes("jispec-cli trace ...") ||
    cliHelp.stdout.includes("jispec-cli artifact ...") ||
    cliHelp.stdout.includes("jispec-cli agent ...") ||
    cliHelp.stdout.includes("jispec-cli pipeline ...") ||
    cliHelp.stdout.includes("jispec-cli template ...") ||
    cliHelp.stdout.includes("jispec-cli dependency ...")
  ) {
    issues.push("CLI help output still exposes the legacy compatibility surface.");
  } else {
    details.push("CLI help output no longer exposes the legacy compatibility surface.");
  }

  if (!files.packageJson) {
    issues.push("package.json is missing.");
  } else if (
    files.packageJson.includes("\"validate:repo\"") ||
    files.packageJson.includes("\"check:jispec\"")
  ) {
    issues.push("package.json still exposes retired compatibility scripts.");
  } else {
    details.push("package.json removed retired compatibility scripts.");
  }

  if (!files.doctor) {
    issues.push("Doctor source is missing.");
  } else if (
    !files.doctor.includes("doctor mainline") ||
    !files.doctor.includes("doctor runtime") ||
    !files.doctor.includes("doctor pilot") ||
    !files.doctor.includes("doctor global")
  ) {
    issues.push("Doctor profiles are not all explicitly represented.");
  } else {
    details.push("Doctor profiles remain explicitly partitioned.");
  }

  details.push(`Frozen surfaces: ${ABSOLUTE_TERMINAL_FROZEN_SURFACES.length}`);
  details.push(`Retained surfaces: ${ABSOLUTE_TERMINAL_RETAINED_SURFACES.length}`);
  details.push(`Deleted surfaces: ${ABSOLUTE_TERMINAL_DELETED_SURFACES.length}`);

  return {
    ready: issues.length === 0,
    frozenSurfaces: ABSOLUTE_TERMINAL_FROZEN_SURFACES,
    retainedSurfaces: ABSOLUTE_TERMINAL_RETAINED_SURFACES,
    deletedSurfaces: ABSOLUTE_TERMINAL_DELETED_SURFACES,
    details,
    issues,
  };
}

function readText(filePath: string): string | undefined {
  return fs.existsSync(filePath) ? fs.readFileSync(filePath, "utf-8") : undefined;
}

function runCliHelp(root: string): { ok: boolean; stdout: string; stderr: string } {
  const cliPath = path.join(root, "tools", "jispec", "cli.ts");
  const result = spawnSync(
    process.execPath,
    ["--import", "tsx", cliPath, "--help"],
    {
      cwd: root,
      encoding: "utf-8",
    },
  );

  return {
    ok: result.status === 0,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}
