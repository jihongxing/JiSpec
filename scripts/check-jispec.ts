import path from "node:path";
import { runVerify } from "../tools/jispec/verify/verify-runner";
import {
  buildCiOutputDir,
  buildVerifyReport,
  detectCiProvider,
  writeVerifyArtifacts,
} from "../tools/jispec/ci/verify-report";
import { renderCiSummaryMarkdown, renderCiSummaryText } from "../tools/jispec/ci/ci-summary";
import { renderVerifySummaryMarkdown } from "../tools/jispec/ci/verify-summary";
import {
  isGitHubActionsEnv,
  buildGitHubContext,
  writeGitHubStepSummary,
  emitGitHubAnnotations,
  writeGitHubPrCommentDraft,
} from "../tools/jispec/ci/github-action";
import {
  isGitLabCiEnv,
  buildGitLabContext,
  writeGitLabNoteArtifact,
} from "../tools/jispec/ci/gitlab-note";

/**
 * CI wrapper for JiSpec verify.
 * Detects CI environment and writes appropriate outputs.
 */
async function main(): Promise<number> {
  const repoRoot = resolveRepoRoot(process.argv.slice(2));
  const ciOutputDir = buildCiOutputDir(repoRoot);

  const verifyResult = await runVerify({
    root: repoRoot,
    useBaseline: true,
    applyWaivers: true,
  });

  let context;
  if (isGitHubActionsEnv()) {
    context = buildGitHubContext();
  } else if (isGitLabCiEnv()) {
    context = buildGitLabContext();
  } else {
    context = {
      repoRoot,
      provider: detectCiProvider(),
    };
  }
  context.repoRoot = repoRoot;

  const report = buildVerifyReport(verifyResult, context);
  const artifactPaths = writeVerifyArtifacts(
    repoRoot,
    report,
    renderCiSummaryMarkdown(report),
    renderVerifySummaryMarkdown(report),
  );

  if (isGitHubActionsEnv()) {
    writeGitHubStepSummary(report);
    emitGitHubAnnotations(report);
    writeGitHubPrCommentDraft(report, repoRoot);
  } else if (isGitLabCiEnv()) {
    writeGitLabNoteArtifact(report, repoRoot);
  }

  console.log(renderCiSummaryText(report));
  console.log(`CI artifacts written to ${path.relative(repoRoot, ciOutputDir).replace(/\\/g, "/")}`);
  console.log(`- ${path.relative(repoRoot, artifactPaths.reportPath).replace(/\\/g, "/")}`);
  console.log(`- ${path.relative(repoRoot, artifactPaths.summaryPath).replace(/\\/g, "/")}`);
  console.log(`- ${path.relative(repoRoot, artifactPaths.verifySummaryPath).replace(/\\/g, "/")}`);

  return verifyResult.ok ? 0 : 1;
}

function resolveRepoRoot(argv: string[]): string {
  const envRoot = process.env.JISPEC_CI_ROOT;
  if (envRoot && envRoot.trim().length > 0) {
    return path.resolve(envRoot);
  }

  const rootIndex = argv.findIndex((arg) => arg === "--root");
  if (rootIndex !== -1 && argv[rootIndex + 1]) {
    return path.resolve(argv[rootIndex + 1]);
  }

  const rootWithEquals = argv.find((arg) => arg.startsWith("--root="));
  if (rootWithEquals) {
    return path.resolve(rootWithEquals.slice("--root=".length));
  }

  return path.resolve(__dirname, "..");
}

void main().then((code) => {
  process.exitCode = code;
});
