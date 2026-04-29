import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { runBootstrapAdopt, type BootstrapAdoptResult } from "../tools/jispec/bootstrap/adopt";

interface CommandExecution {
  status: number | null;
  stdout: string;
  stderr: string;
}

interface SampleDemoReport {
  sampleTemplatePath: string;
  workspaceRoot: string;
  sessionId: string;
  commands: {
    discover: string;
    draft: string;
    adoptInteractive: string;
    policyMigrate: string;
    verify: string;
    ciVerify: string;
  };
  discover: {
    routeCount: number;
    highConfidenceRouteCount: number;
    schemaCount: number;
    testCount: number;
    outputPaths: string[];
  };
  draft: {
    generationMode?: string;
    evidenceStrength?: string;
    artifactKinds: string[];
  };
  adopt: {
    status: string;
    adoptedArtifactPaths: string[];
    specDebtFiles: string[];
    rejectedArtifactKinds: string[];
    takeoverReportPath?: string;
  };
  verify: {
    verdict: string;
    ok: boolean;
    issueCodes: string[];
    specDebtPaths: string[];
    factsPath: string;
  };
  ciVerify: {
    exitCode: number | null;
    verdict: string;
    reportPath: string;
    summaryPath: string;
    verifySummaryPath: string;
  };
  keyPaths: {
    evidenceGraphPath: string;
    sessionManifestPath: string;
    policyPath: string;
    contractsRoot: string;
    specDebtRoot: string;
  };
}

interface CliJsonResult {
  summary?: {
    routeCount?: number;
    highConfidenceRouteCount?: number;
    schemaCount?: number;
    testCount?: number;
  };
  writtenFiles?: string[];
  sessionId?: string;
  generationMode?: string;
  qualitySummary?: {
    evidenceStrength?: string;
  };
  artifacts?: Array<{
    kind?: string;
  }>;
  verdict?: string;
  ok?: boolean;
  issues?: Array<{
    code?: string;
    path?: string;
  }>;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const repoRoot = path.resolve(__dirname, "..");
  const sampleTemplatePath = path.join(repoRoot, "examples", "v1-mainline-sample-repo");
  const workspaceRoot = prepareWorkspace(options.workspace, repoRoot, sampleTemplatePath);

  try {
    initializeGitRepository(workspaceRoot);

    const discover = runCli(repoRoot, ["bootstrap", "discover", "--root", workspaceRoot, "--json"]);
    assertCommandOk(discover, "bootstrap discover");
    const discoverPayload = JSON.parse(discover.stdout) as CliJsonResult;

    const draft = runCli(repoRoot, ["bootstrap", "draft", "--root", workspaceRoot, "--json"]);
    assertCommandOk(draft, "bootstrap draft");
    const draftPayload = JSON.parse(draft.stdout) as CliJsonResult;

    if (typeof draftPayload.sessionId !== "string" || draftPayload.sessionId.length === 0) {
      throw new Error("bootstrap draft did not return a sessionId");
    }

    const adopt = await runBootstrapAdopt({
      root: workspaceRoot,
      session: draftPayload.sessionId,
      decisions: [
        { artifactKind: "domain", kind: "accept" },
        { artifactKind: "api", kind: "skip_as_spec_debt", note: "Keep legacy order API under review for the first takeover." },
        { artifactKind: "feature", kind: "reject", note: "Feature phrasing can wait until the API review is done." },
      ],
    });

    const policyMigrate = runCli(repoRoot, ["policy", "migrate", "--root", workspaceRoot, "--json"]);
    assertCommandOk(policyMigrate, "policy migrate");

    const factsPath = ".spec/facts/verify/sample-facts.json";
    const verify = runCli(repoRoot, ["verify", "--root", workspaceRoot, "--json", "--facts-out", factsPath]);
    assertCommandOk(verify, "verify");
    const verifyPayload = JSON.parse(verify.stdout) as CliJsonResult;

    const ciVerify = runCiVerify(repoRoot, workspaceRoot);
    assertCommandOk(ciVerify, "ci:verify");
    const ciReportPath = path.join(workspaceRoot, ".jispec-ci", "verify-report.json");
    const ciReport = JSON.parse(fs.readFileSync(ciReportPath, "utf-8")) as { verdict?: string };

    const report: SampleDemoReport = {
      sampleTemplatePath: path.relative(repoRoot, sampleTemplatePath).replace(/\\/g, "/"),
      workspaceRoot,
      sessionId: draftPayload.sessionId,
      commands: {
        discover: `npm run jispec-cli -- bootstrap discover --root ${workspaceRoot} --json`,
        draft: `npm run jispec-cli -- bootstrap draft --root ${workspaceRoot} --json`,
        adoptInteractive: `npm run jispec-cli -- adopt --interactive --root ${workspaceRoot} --session ${draftPayload.sessionId}`,
        policyMigrate: `npm run jispec-cli -- policy migrate --root ${workspaceRoot} --json`,
        verify: `npm run jispec-cli -- verify --root ${workspaceRoot} --json --facts-out ${factsPath}`,
        ciVerify: `node --import tsx ./scripts/check-jispec.ts --root ${workspaceRoot}`,
      },
      discover: {
        routeCount: discoverPayload.summary?.routeCount ?? 0,
        highConfidenceRouteCount: discoverPayload.summary?.highConfidenceRouteCount ?? 0,
        schemaCount: discoverPayload.summary?.schemaCount ?? 0,
        testCount: discoverPayload.summary?.testCount ?? 0,
        outputPaths: discoverPayload.writtenFiles ?? [],
      },
      draft: {
        generationMode: draftPayload.generationMode,
        evidenceStrength: draftPayload.qualitySummary?.evidenceStrength,
        artifactKinds: readDraftArtifactKinds(workspaceRoot, draftPayload.sessionId),
      },
      adopt: {
        status: adopt.status,
        adoptedArtifactPaths: adopt.adoptedArtifactPaths,
        specDebtFiles: adopt.specDebtFiles,
        rejectedArtifactKinds: adopt.rejectedArtifactKinds,
        takeoverReportPath: adopt.takeoverReportPath,
      },
      verify: {
        verdict: verifyPayload.verdict ?? "UNKNOWN",
        ok: verifyPayload.ok === true,
        issueCodes: (verifyPayload.issues ?? []).map((issue) => issue.code ?? "UNKNOWN"),
        specDebtPaths: (verifyPayload.issues ?? [])
          .filter((issue) => issue.code === "BOOTSTRAP_SPEC_DEBT_PENDING")
          .map((issue) => issue.path ?? ""),
        factsPath,
      },
      ciVerify: {
        exitCode: ciVerify.status,
        verdict: ciReport.verdict ?? "UNKNOWN",
        reportPath: ".jispec-ci/verify-report.json",
        summaryPath: ".jispec-ci/ci-summary.md",
        verifySummaryPath: ".jispec-ci/verify-summary.md",
      },
      keyPaths: {
        evidenceGraphPath: ".spec/facts/bootstrap/evidence-graph.json",
        sessionManifestPath: `.spec/sessions/${draftPayload.sessionId}/manifest.json`,
        policyPath: ".spec/policy.yaml",
        contractsRoot: ".spec/contracts",
        specDebtRoot: `.spec/spec-debt/${draftPayload.sessionId}`,
      },
    };

    if (options.json) {
      console.log(JSON.stringify(report, null, 2));
      return;
    }

    console.log(renderTextReport(report, adopt));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`V1 sample repo demo failed: ${message}`);
    process.exitCode = 1;
  }
}

function parseArgs(argv: string[]): { workspace?: string; json: boolean } {
  let workspace: string | undefined;
  let json = false;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
      continue;
    }
    if (arg === "--workspace") {
      workspace = argv[index + 1];
      index += 1;
      continue;
    }
    if (arg.startsWith("--workspace=")) {
      workspace = arg.slice("--workspace=".length);
    }
  }

  return { workspace, json };
}

function prepareWorkspace(workspaceArg: string | undefined, repoRoot: string, sampleTemplatePath: string): string {
  const workspaceRoot = workspaceArg
    ? path.resolve(repoRoot, workspaceArg)
    : fs.mkdtempSync(path.join(os.tmpdir(), "jispec-v1-sample-"));

  fs.rmSync(workspaceRoot, { recursive: true, force: true });
  fs.mkdirSync(path.dirname(workspaceRoot), { recursive: true });
  fs.cpSync(sampleTemplatePath, workspaceRoot, { recursive: true });
  return workspaceRoot;
}

function runCli(repoRoot: string, args: string[]): CommandExecution {
  const cliPath = path.join(repoRoot, "tools", "jispec", "cli.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", cliPath, ...args], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function runCiVerify(repoRoot: string, root: string): CommandExecution {
  const scriptPath = path.join(repoRoot, "scripts", "check-jispec.ts");
  const result = spawnSync(process.execPath, ["--import", "tsx", scriptPath, "--root", root], {
    cwd: repoRoot,
    encoding: "utf-8",
  });

  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
  };
}

function assertCommandOk(result: CommandExecution, label: string): void {
  if (result.status !== 0) {
    throw new Error(`${label} exited with ${result.status}. stderr: ${result.stderr}`);
  }
}

function initializeGitRepository(root: string): void {
  const commands: Array<{ program: string; args: string[]; label: string }> = [
    { program: "git", args: ["init"], label: "git init" },
    { program: "git", args: ["config", "user.email", "v1-sample@example.com"], label: "git config user.email" },
    { program: "git", args: ["config", "user.name", "JiSpec V1 Sample"], label: "git config user.name" },
    { program: "git", args: ["add", "."], label: "git add ." },
    { program: "git", args: ["commit", "-m", "Initial sample repo baseline"], label: "git commit" },
  ];

  for (const command of commands) {
    const result = spawnSync(command.program, command.args, {
      cwd: root,
      encoding: "utf-8",
    });

    if (result.status !== 0) {
      throw new Error(`Failed at ${command.label}: ${result.stderr}`);
    }
  }
}

function readDraftArtifactKinds(root: string, sessionId: string): string[] {
  const draftsDir = path.join(root, ".spec", "sessions", sessionId, "drafts");
  if (!fs.existsSync(draftsDir)) {
    return [];
  }

  return fs
    .readdirSync(draftsDir)
    .sort((left, right) => left.localeCompare(right))
    .map((fileName) => {
      switch (fileName) {
        case "domain.yaml":
          return "domain";
        case "api_spec.json":
          return "api";
        case "behaviors.feature":
          return "feature";
        default:
          return path.parse(fileName).name;
      }
    });
}

function renderTextReport(report: SampleDemoReport, adopt: BootstrapAdoptResult): string {
  const lines = [
    `Prepared V1 sample repo at \`${report.workspaceRoot}\` from \`${report.sampleTemplatePath}\`.`,
    `Bootstrap discover found ${report.discover.routeCount} route(s), ${report.discover.schemaCount} schema asset(s), and ${report.discover.testCount} test asset(s).`,
    `Bootstrap draft opened session \`${report.sessionId}\` in ${report.draft.generationMode ?? "unknown"} mode with evidence strength ${report.draft.evidenceStrength ?? "unknown"}.`,
    `Adopt accepted ${adopt.adoptedArtifactPaths.length} artifact(s), deferred ${adopt.specDebtFiles.length} artifact(s) into spec debt, and rejected ${adopt.rejectedArtifactKinds.length} artifact(s).`,
    `Verify returned ${report.verify.verdict}; deferred bootstrap debt stays advisory while adopted contracts remain enforced.`,
    `CI verify returned ${report.ciVerify.verdict} and wrote ${report.ciVerify.reportPath}, ${report.ciVerify.summaryPath}, and ${report.ciVerify.verifySummaryPath}.`,
    "",
    "Interactive replay command for the same draft decisions:",
    `- ${report.commands.adoptInteractive}`,
    "",
    "Key artifact paths:",
    `- ${report.keyPaths.evidenceGraphPath}`,
    `- ${report.keyPaths.sessionManifestPath}`,
    `- ${report.keyPaths.policyPath}`,
    `- ${report.ciVerify.reportPath}`,
    `- ${report.ciVerify.summaryPath}`,
    `- ${report.ciVerify.verifySummaryPath}`,
  ];

  return lines.join("\n");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
