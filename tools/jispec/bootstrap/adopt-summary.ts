import {
  getBootstrapAdoptSummaryRelativePath,
  type BootstrapTakeoverReport,
  type BootstrapTakeoverDecisionRecord,
  renderEvidenceDistributionSummary,
} from "./takeover";
import {
  HUMAN_SUMMARY_COMPANION_NOTE,
  renderHumanDecisionSnapshot,
  renderHumanReviewerDecisionCompanion,
} from "../human-decision-packet";

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
    ...renderHumanDecisionSnapshot({
      currentState: `${report.status} takeover adoption with ${report.adoptedArtifactPaths.length} adopted contract(s), ${report.specDebtPaths.length} deferred debt record(s), and ${report.rejectedArtifactKinds.length} rejected draft(s)`,
      risk: `Correction load ${renderCorrectionLoad(report.decisions)}; ${renderCorrectionHotspots(report.decisions)} hotspot(s) need reviewer attention`,
      evidence: [
        `\`${report.manifestPath}\``,
        `\`${report.sourceEvidenceGraphPath}\``,
        "`.spec/handoffs/bootstrap-takeover.json`",
      ],
      owner: report.replay?.actor ? `reviewer \`${report.replay.actor}\`` : "reviewer",
      nextCommand: "`npm run jispec-cli -- verify`",
    }),
    ...renderHumanReviewerDecisionCompanion({
      subject: `bootstrap adoption ${report.sessionId}`,
      truthSources: [
        report.manifestPath,
        report.sourceEvidenceGraphPath,
        ".spec/handoffs/bootstrap-takeover.json",
      ],
      strongestEvidence: report.adoptedArtifactPaths.length > 0
        ? report.adoptedArtifactPaths.slice(0, 5).map((artifactPath) => `adopted contract: ${artifactPath}`)
        : ["No contracts were adopted in this takeover commit."],
      inferredEvidence: report.decisions
        .filter((decision) => decision.edited || decision.finalState !== "adopted")
        .slice(0, 5)
        .map((decision) => `${decision.artifactKind} requires reviewer attention after ${decision.finalState}`),
      drift: [
        `Correction load: ${renderCorrectionLoad(report.decisions)}`,
        `Correction hotspots: ${renderCorrectionHotspots(report.decisions)}`,
      ],
      impact: [
        ...report.adoptedArtifactPaths.slice(0, 8).map((artifactPath) => `contract: ${artifactPath}`),
        ...report.specDebtPaths.slice(0, 4).map((artifactPath) => `spec debt: ${artifactPath}`),
      ],
      nextSteps: renderNextVerifyStep(report),
      maxLines: 150,
    }),
    "",
    "## Source Of Truth",
    "",
    `- Machine report: \`${report.manifestPath}\` and \`.spec/handoffs/bootstrap-takeover.json\`.`,
    `- ${HUMAN_SUMMARY_COMPANION_NOTE}`,
    "",
    "## Decision Totals",
    "",
    `- Accepted or edited contracts: ${report.adoptedArtifactPaths.length}`,
    `- Deferred spec debt records: ${report.specDebtPaths.length}`,
    `- Rejected draft artifacts: ${report.rejectedArtifactKinds.length}`,
    `- Edited draft artifacts: ${report.decisions.filter((decision) => decision.edited).length}`,
    `- Correction load: ${renderCorrectionLoad(report.decisions)}`,
    "",
    "## Evidence Distribution",
    "",
    `- ${renderEvidenceDistributionSummary(report.evidenceDistribution)}`,
    "",
    "## Correction Loop",
    "",
    `- Hotspots: ${renderCorrectionHotspots(report.decisions)}`,
    "",
    "| Artifact | Final State | Edited | Owner Review | Note |",
    "| --- | --- | --- | --- | --- |",
    ...renderCorrectionRows(report.decisions),
    "",
    "## Accepted Contracts",
    "",
    ...renderAcceptedContracts(report.decisions),
    "",
    "## Deferred Spec Debt",
    "",
    ...renderDeferredSpecDebt(report.decisions),
    "",
    "## Spec Debt Ledger",
    "",
    "- Ledger: `.spec/spec-debt/ledger.yaml`.",
    "- Deferred records should keep owner, reason, affected assets, and repayment hint aligned with the ledger contract.",
    "",
    "## Rejected Drafts",
    "",
    ...renderRejectedDrafts(report.decisions),
    "",
    "## Human Edits",
    "",
    ...renderHumanEdits(report.decisions),
    "",
    "## Replay / Provenance",
    "",
    ...renderReplayProvenance(report),
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

function renderReplayProvenance(report: BootstrapTakeoverReport): string[] {
  const replay = report.replay;
  if (!replay) {
    return ["- Replay metadata is not available for this adopt summary."];
  }

  return [
    `- Source session: \`${replay.sourceSession ?? report.sessionId}\``,
    `- Source artifact: \`${replay.sourceArtifact ?? report.manifestPath}\``,
    `- Input artifacts: ${replay.inputArtifacts.length > 0 ? replay.inputArtifacts.slice(0, 8).map((entry) => `\`${entry}\``).join(", ") : "none recorded"}`,
    `- Actor: \`${replay.actor ?? "not recorded"}\``,
    `- Reason: ${replay.reason ?? "not recorded"}`,
    `- Previous outcome: \`${replay.previousOutcome ?? "not recorded"}\``,
    `- Replay command: \`${replay.commands.rerun ?? "not recorded"}\``,
    `- Next human action: ${replay.nextHumanAction}`,
  ];
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
    const target = decision.targetPath ? ` -> ${linkPath(decision.targetPath)}` : "";
    return `- \`${decision.artifactKind}\`${target}${note}`;
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

function renderCorrectionRows(decisions: BootstrapTakeoverDecisionRecord[]): string[] {
  if (decisions.length === 0) {
    return ["| none | none | no | no | none |"];
  }

  return decisions.map((decision) =>
    [
      `\`${decision.artifactKind}\``,
      `\`${decision.finalState}\``,
      decision.edited ? "yes" : "no",
      decision.finalState === "adopted" && !decision.edited ? "no" : "yes",
      escapeTableCell(decision.note ?? "none"),
    ].join(" | ").replace(/^/, "| ").replace(/$/, " |"),
  );
}

function renderCorrectionLoad(decisions: BootstrapTakeoverDecisionRecord[]): string {
  if (decisions.length === 0) {
    return "0%";
  }

  const load = decisions.reduce((sum, decision) => {
    if (decision.finalState === "spec_debt" || decision.finalState === "rejected") {
      return sum + 1;
    }
    if (decision.edited) {
      return sum + 0.5;
    }
    return sum;
  }, 0);

  return `${Math.round((load / decisions.length) * 100)}%`;
}

function renderCorrectionHotspots(decisions: BootstrapTakeoverDecisionRecord[]): string {
  const hotspots = Array.from(new Set(decisions.flatMap((decision) => {
    if (decision.finalState === "spec_debt") {
      return [`deferred_${decision.artifactKind}`, "spec_debt_defer"];
    }
    if (decision.finalState === "rejected") {
      return [`rejected_${decision.artifactKind}`, "rejected_draft"];
    }
    if (decision.edited) {
      return [`edited_${decision.artifactKind}`, "human_edit"];
    }
    return [];
  }))).sort((left, right) => left.localeCompare(right));

  return hotspots.length > 0 ? hotspots.map((hotspot) => `\`${hotspot}\``).join(", ") : "none";
}

function renderNextVerifyStep(report: BootstrapTakeoverReport): string[] {
  const lines = ["- Run `npm run jispec-cli -- verify` after reviewing this adopt summary."];

  if (report.specDebtPaths.length > 0) {
    lines.push("- Treat deferred spec debt as known historical debt in `.spec/spec-debt/ledger.yaml`; do not confuse it with a new blocking issue.");
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

function escapeTableCell(value: string): string {
  return value.replace(/\|/g, "\\|");
}
