import {
  getBootstrapAdoptSummaryRelativePath,
  type BootstrapTakeoverReport,
  type BootstrapTakeoverDecisionRecord,
} from "./takeover";

export interface BootstrapAdoptSummary {
  relativePath: string;
  content: string;
}

export function buildBootstrapAdoptSummary(report: BootstrapTakeoverReport): BootstrapAdoptSummary {
  const lines = [
    "# Bootstrap Adopt Summary",
    "",
    `Session: \`${report.sessionId}\``,
    `Status: \`${report.status}\``,
    `Generated from: \`${report.sourceEvidenceGraphPath}\``,
    "",
    "## Decision Totals",
    "",
    `- Accepted or edited contracts: ${report.adoptedArtifactPaths.length}`,
    `- Deferred spec debt records: ${report.specDebtPaths.length}`,
    `- Rejected draft artifacts: ${report.rejectedArtifactKinds.length}`,
    "",
    "## Accepted Contracts",
    "",
    ...renderAcceptedContracts(report.decisions),
    "",
    "## Deferred Spec Debt",
    "",
    ...renderDeferredSpecDebt(report.decisions),
    "",
    "## Rejected Drafts",
    "",
    ...renderRejectedDrafts(report.decisions),
    "",
    "## Human Edits",
    "",
    ...renderHumanEdits(report.decisions),
    "",
    "## Next Verify Step",
    "",
    ...renderNextVerifyStep(report),
    "",
  ];

  return {
    relativePath: getBootstrapAdoptSummaryRelativePath(),
    content: `${lines.join("\n")}\n`,
  };
}

function renderAcceptedContracts(decisions: BootstrapTakeoverDecisionRecord[]): string[] {
  const accepted = decisions.filter((decision) => decision.finalState === "adopted");
  if (accepted.length === 0) {
    return ["- No draft artifacts were accepted into `.spec/contracts/`."];
  }

  return accepted.map((decision) => {
    const edit = decision.edited ? " edited before adoption" : "";
    const sources = renderSourceFiles(decision.sourceFiles);
    const note = decision.note ? `; note: ${decision.note}` : "";
    return `- \`${decision.artifactKind}\` -> ${linkPath(decision.targetPath)}${edit}; confidence ${formatConfidence(decision.confidenceScore)}${sources}${note}`;
  });
}

function renderDeferredSpecDebt(decisions: BootstrapTakeoverDecisionRecord[]): string[] {
  const deferred = decisions.filter((decision) => decision.finalState === "spec_debt");
  if (deferred.length === 0) {
    return ["- No draft artifacts were deferred as spec debt."];
  }

  return deferred.map((decision) => {
    const note = decision.note ? `; note: ${decision.note}` : "";
    return `- \`${decision.artifactKind}\` -> ${linkPath(decision.targetPath)}${note}`;
  });
}

function renderRejectedDrafts(decisions: BootstrapTakeoverDecisionRecord[]): string[] {
  const rejected = decisions.filter((decision) => decision.finalState === "rejected");
  if (rejected.length === 0) {
    return ["- No draft artifacts were rejected."];
  }

  return rejected.map((decision) => {
    const note = decision.note ? `; note: ${decision.note}` : "";
    return `- \`${decision.artifactKind}\`${note}`;
  });
}

function renderHumanEdits(decisions: BootstrapTakeoverDecisionRecord[]): string[] {
  const edited = decisions.filter((decision) => decision.edited);
  if (edited.length === 0) {
    return ["- No draft artifacts were edited during adopt."];
  }

  return edited.map((decision) => {
    const note = decision.note ? ` Reviewer note: ${decision.note}.` : "";
    return `- \`${decision.artifactKind}\` was edited before writing ${linkPath(decision.targetPath)}.${note}`;
  });
}

function renderNextVerifyStep(report: BootstrapTakeoverReport): string[] {
  const lines = ["- Run `npm run jispec-cli -- verify` after reviewing this adopt summary."];

  if (report.specDebtPaths.length > 0) {
    lines.push("- Treat deferred spec debt as known historical debt; do not confuse it with a new blocking issue.");
  }
  if (report.adoptedArtifactPaths.length > 0) {
    lines.push("- If verify reports missing adopted contracts, treat that as a blocking takeover regression.");
  }

  return lines;
}

function linkPath(targetPath: string | undefined): string {
  if (!targetPath) {
    return "`unwritten`";
  }
  return `\`${targetPath}\``;
}

function renderSourceFiles(sourceFiles: string[]): string {
  if (sourceFiles.length === 0) {
    return "";
  }
  return `; sources ${sourceFiles.slice(0, 3).map((sourceFile) => `\`${sourceFile}\``).join(", ")}`;
}

function formatConfidence(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
