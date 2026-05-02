import fs from "node:fs";
import path from "node:path";
import { inferNextAction, selectHighlightedIssues, type VerifyReport, type VerifyReportIssue } from "./verify-report";
import { renderHumanDecisionSnapshot } from "../human-decision-packet";

const LOCAL_VERIFY_SUMMARY_PATH = ".spec/handoffs/verify-summary.md";
const CI_VERIFY_SUMMARY_FILENAME = "verify-summary.md";

export function getLocalVerifySummaryPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), LOCAL_VERIFY_SUMMARY_PATH);
}

export function getLocalVerifySummaryRelativePath(): string {
  return LOCAL_VERIFY_SUMMARY_PATH;
}

export function getCiVerifySummaryPath(outputDir: string): string {
  return path.join(outputDir, CI_VERIFY_SUMMARY_FILENAME);
}

export function renderVerifySummaryMarkdown(report: VerifyReport): string {
  const lines = [
    "# JiSpec Verify Summary",
    "",
    `Verdict: \`${report.verdict}\``,
    `Merge status: ${renderMergeStatus(report)}`,
    `Generated at: \`${report.generatedAt}\``,
    "",
    ...renderHumanDecisionSnapshot({
      currentState: `${report.verdict} - ${renderMergeStatus(report)}`,
      risk: renderVerifyDecisionRisk(report),
      evidence: renderVerifyDecisionEvidence(report),
      owner: "repo owner / reviewer",
      nextCommand: renderVerifyDecisionCommand(report),
    }),
    "## Decision",
    "",
    `- ${inferNextAction(report)}`,
    ...renderMitigationContext(report),
    ...renderGreenfieldControlContextSection(report),
    "",
    "## Counts",
    "",
    `- Total issues: ${report.counts.total}`,
    `- Blocking: ${report.counts.blocking}`,
    `- Advisory: ${report.counts.advisory}`,
    `- Non-blocking runtime errors: ${report.counts.nonblockingError}`,
    "",
    "## Blocking Issues",
    "",
    ...renderIssueGroup(report.issues.filter((issue) => issue.severity === "blocking"), "No blocking issues."),
    "",
    "## Advisory And Debt",
    "",
    ...renderAdvisoryAndDebt(report),
    "",
    "## Runtime Notes",
    "",
    ...renderIssueGroup(report.issues.filter((issue) => issue.severity === "nonblocking_error"), "No non-blocking runtime errors."),
    "",
    "## Top Review Items",
    "",
    ...renderIssueGroup(selectHighlightedIssues(report, 5), "No issues to review."),
    "",
    "## Impact Graph",
    "",
    ...renderImpactGraphContext(report),
    "",
    "## Source Of Truth",
    "",
    "- Machine-readable verify report remains the source of truth.",
    "- This Markdown file is a human-readable companion summary, not a machine API.",
    "",
  ];

  return `${lines.join("\n")}\n`;
}

export function renderGreenfieldControlContext(report: VerifyReport): string[] {
  if (!isGreenfieldReport(report)) {
    return [];
  }

  const matchedRules = (report.matchedPolicyRules ?? []).filter((rule) => rule.toLowerCase().includes("greenfield"));

  return [
    "- Uses the same verify decision model as takeover: verdict and merge status decide whether work can merge; Greenfield context explains the control area.",
    `- Review gate: ${renderCategorySummary(filterGreenfieldIssues(report, isGreenfieldReviewIssue))}; resolve Initialization Review Pack items by adopt, reject correction, defer, or waive.`,
    `- Contract graph / spec delta: ${renderCategorySummary(filterGreenfieldIssues(report, isGreenfieldContractGraphOrSpecDeltaIssue))}; reconcile required updates before treating the change as verified.`,
    `- Implementation facts ratchet: ${renderCategorySummary(filterGreenfieldIssues(report, isGreenfieldImplementationRatchetIssue))}; map governed implementation facts to the Evidence Graph or classify them explicitly.`,
    `- Spec debt: ${renderCategorySummary(filterGreenfieldIssues(report, isGreenfieldSpecDebtIssue))}; repay, defer with owner and expiry, or waive with an audit trail.`,
    `- Policy overlay: ${matchedRules.length > 0 ? matchedRules.map((rule) => `\`${rule}\``).join(", ") : "no Greenfield policy rules matched"}.`,
    "- Next action vocabulary stays shared with verify summary: fix, adopt, defer, waive, update contracts, then re-run verify.",
  ];
}

export function writeLocalVerifySummary(rootInput: string, report: VerifyReport): string {
  const summaryPath = getLocalVerifySummaryPath(rootInput);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, renderVerifySummaryMarkdown(report), "utf-8");
  return summaryPath;
}

export function writeCiVerifySummary(outputDir: string, report: VerifyReport): string {
  const summaryPath = getCiVerifySummaryPath(outputDir);
  fs.mkdirSync(path.dirname(summaryPath), { recursive: true });
  fs.writeFileSync(summaryPath, renderVerifySummaryMarkdown(report), "utf-8");
  return summaryPath;
}

function renderMergeStatus(report: VerifyReport): string {
  if (report.counts.blocking > 0) {
    return "Blocked until blocking issues are fixed or explicitly waived.";
  }
  if (report.ok && report.counts.total === 0) {
    return "Ready to merge.";
  }
  if (report.ok) {
    return "Mergeable with advisory follow-up.";
  }
  return "Review required before merge.";
}

function renderVerifyDecisionRisk(report: VerifyReport): string {
  if (report.counts.blocking > 0) {
    return `${report.counts.blocking} blocking issue(s) must be fixed, waived, or explicitly deferred before merge.`;
  }
  if (report.counts.advisory > 0 || report.counts.nonblockingError > 0) {
    return `${report.counts.advisory} advisory item(s) and ${report.counts.nonblockingError} non-blocking runtime error(s) need follow-up.`;
  }
  return "no verify risk recorded";
}

function renderVerifyDecisionEvidence(report: VerifyReport): string[] {
  const evidence: string[] = ["`.jispec-ci/verify-report.json` or `.spec/handoffs/verify-summary.md`"];
  if (report.factsContractVersion) {
    evidence.push(`facts contract \`${report.factsContractVersion}\``);
  }
  if (Array.isArray(report.matchedPolicyRules) && report.matchedPolicyRules.length > 0) {
    evidence.push(`${report.matchedPolicyRules.length} matched policy rule(s)`);
  }
  if (report.modes?.waiversApplied) {
    evidence.push(`${report.modes.waiversApplied} matched waiver(s)`);
  }
  const agentDiscipline = report.modes?.agentDiscipline as { latestReportPath?: string; completionStatus?: string } | undefined;
  if (agentDiscipline?.latestReportPath) {
    evidence.push(`Agent discipline: \`${agentDiscipline.latestReportPath}\` (${agentDiscipline.completionStatus ?? "unknown"})`);
  }
  return evidence;
}

function renderVerifyDecisionCommand(report: VerifyReport): string {
  if (report.counts.blocking > 0) {
    return "`npm run jispec-cli -- verify` after fixing blockers or recording explicit governance decisions";
  }
  return "`npm run ci:verify` before merge or release";
}

function renderGreenfieldControlContextSection(report: VerifyReport): string[] {
  const context = renderGreenfieldControlContext(report);
  if (context.length === 0) {
    return [];
  }

  return [
    "",
    "## Greenfield Control Context",
    "",
    ...context,
  ];
}

function renderMitigationContext(report: VerifyReport): string[] {
  const lines: string[] = [];
  const modes = report.modes ?? {};

  if (modes.baselineApplied) {
    const count = typeof modes.baselineMatchCount === "number" ? ` (${modes.baselineMatchCount} matched)` : "";
    lines.push(`- Historical baseline applied${count}.`);
  }
  if (modes.waiversApplied) {
    lines.push(`- ${modes.waiversApplied} waiver(s) matched and downgraded only matching issue(s); unmatched blocking issues remain blocking.`);
  }
  if (modes.waiverLifecycle && typeof modes.waiverLifecycle === "object") {
    const lifecycle = modes.waiverLifecycle as Record<string, unknown>;
    const active = numberValue(lifecycle.active);
    const expired = numberValue(lifecycle.expired);
    const revoked = numberValue(lifecycle.revoked);
    const invalid = numberValue(lifecycle.invalid);
    lines.push(`- Waiver lifecycle: ${active} active, ${expired} expired, ${revoked} revoked, ${invalid} invalid.`);
  }
  if (Array.isArray(modes.unmatchedActiveWaiverIds) && modes.unmatchedActiveWaiverIds.length > 0) {
    lines.push(`- ${modes.unmatchedActiveWaiverIds.length} active waiver(s) did not match current issues.`);
  }
  if (modes.observeMode) {
    const downgraded =
      typeof modes.observeBlockingDowngraded === "number" ? ` (${modes.observeBlockingDowngraded} blocking downgraded)` : "";
    lines.push(`- Observe mode is enabled${downgraded}.`);
  }
  if (report.factsContractVersion) {
    lines.push(`- Facts contract: \`${report.factsContractVersion}\`.`);
  }
  if (Array.isArray(report.matchedPolicyRules) && report.matchedPolicyRules.length > 0) {
    lines.push(`- Matched policy rules: ${report.matchedPolicyRules.map((rule) => `\`${rule}\``).join(", ")}.`);
  }

  return lines;
}

function renderImpactGraphContext(report: VerifyReport): string[] {
  const modes = report.modes ?? {};
  const freshness = typeof modes.impactGraphFreshness === "string"
    ? modes.impactGraphFreshness
    : "not_available_yet";
  const graphPath = typeof modes.impactGraphPath === "string"
    ? modes.impactGraphPath
    : ".spec/deltas/<changeId>/impact-graph.json";
  return [
    `- Freshness: \`${freshness}\`.`,
    `- Graph: \`${graphPath}\`.`,
    "- Impact graph context is advisory and does not replace deterministic verify issues.",
  ];
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function renderAdvisoryAndDebt(report: VerifyReport): string[] {
  const advisory = report.issues.filter((issue) => issue.severity === "advisory");
  const debt = advisory.filter(isDebtIssue);
  const nonDebt = advisory.filter((issue) => !isDebtIssue(issue));
  const lines: string[] = [];

  if (debt.length > 0) {
    lines.push(`- Known debt items: ${debt.length}`);
    lines.push(...debt.slice(0, 5).map(renderIssueLine));
  } else {
    lines.push("- Known debt items: 0");
  }

  if (nonDebt.length > 0) {
    lines.push(`- Other advisory items: ${nonDebt.length}`);
    lines.push(...nonDebt.slice(0, 5).map(renderIssueLine));
  } else {
    lines.push("- Other advisory items: 0");
  }

  const hidden = advisory.length - Math.min(debt.length, 5) - Math.min(nonDebt.length, 5);
  if (hidden > 0) {
    lines.push(`- ... and ${hidden} more advisory item(s).`);
  }

  return lines;
}

function renderIssueGroup(issues: VerifyReportIssue[], emptyText: string): string[] {
  if (issues.length === 0) {
    return [`- ${emptyText}`];
  }

  const lines = issues.slice(0, 5).map(renderIssueLine);
  if (issues.length > lines.length) {
    lines.push(`- ... and ${issues.length - lines.length} more issue(s).`);
  }
  return lines;
}

function renderIssueLine(issue: VerifyReportIssue): string {
  const location = issue.path ? ` \`${issue.path}\`` : "";
  return `- [${issue.severity}] \`${issue.code}\`${location}: ${issue.message}`;
}

function isDebtIssue(issue: VerifyReportIssue): boolean {
  const haystack = [issue.code, issue.path ?? "", issue.message].join("\n").toLowerCase();
  return haystack.includes("spec_debt") || haystack.includes("spec-debt") || haystack.includes("historical_debt");
}

function isGreenfieldReport(report: VerifyReport): boolean {
  return (
    report.issues.some((issue) => isGreenfieldIssue(issue)) ||
    (report.matchedPolicyRules ?? []).some((rule) => rule.toLowerCase().includes("greenfield"))
  );
}

function isGreenfieldIssue(issue: VerifyReportIssue): boolean {
  const haystack = [issue.code, issue.path ?? "", issue.message, issue.ruleId ?? ""].join("\n").toLowerCase();
  return haystack.includes("greenfield");
}

function filterGreenfieldIssues(
  report: VerifyReport,
  predicate: (issue: VerifyReportIssue) => boolean,
): VerifyReportIssue[] {
  return report.issues.filter((issue) => predicate(issue) && (isGreenfieldIssue(issue) || isGreenfieldReport(report)));
}

function renderCategorySummary(issues: VerifyReportIssue[]): string {
  if (issues.length === 0) {
    return "0 issue(s)";
  }

  const blocking = issues.filter((issue) => issue.severity === "blocking").length;
  const advisory = issues.filter((issue) => issue.severity === "advisory").length;
  const runtime = issues.filter((issue) => issue.severity === "nonblocking_error").length;
  const codes = Array.from(new Set(issues.map((issue) => issue.code))).slice(0, 3);
  const hidden = issues.length - codes.length;
  const codeSummary = hidden > 0 ? `${codes.join(", ")} +${hidden} more` : codes.join(", ");

  return `${issues.length} issue(s): ${blocking} blocking, ${advisory} advisory, ${runtime} runtime (${codeSummary})`;
}

function isGreenfieldReviewIssue(issue: VerifyReportIssue): boolean {
  return issue.code.startsWith("GREENFIELD_REVIEW_") || issue.code.includes("_REVIEW_");
}

function isGreenfieldContractGraphOrSpecDeltaIssue(issue: VerifyReportIssue): boolean {
  return (
    issue.code.startsWith("GREENFIELD_DIRTY_") ||
    issue.code.startsWith("GREENFIELD_SPEC_DRIFT") ||
    issue.code === "GREENFIELD_PROVENANCE_ANCHOR_DRIFT" ||
    issue.code === "SLICE_ARTIFACT_MISSING" ||
    issue.code.includes("_SPEC_DRIFT") ||
    issue.code.includes("_DIRTY_")
  );
}

function isGreenfieldImplementationRatchetIssue(issue: VerifyReportIssue): boolean {
  return (
    issue.code === "GREENFIELD_CODE_DRIFT" ||
    issue.code === "GREENFIELD_CLASSIFIED_CODE_DRIFT" ||
    issue.code === "GREENFIELD_UNRESOLVED_SURFACE" ||
    issue.code.includes("_CODE_DRIFT") ||
    issue.code.includes("_CLASSIFIED_DRIFT")
  );
}

function isGreenfieldSpecDebtIssue(issue: VerifyReportIssue): boolean {
  return (
    issue.code.startsWith("GREENFIELD_SPEC_DEBT_") ||
    issue.code.includes("SPEC_DEBT") ||
    issue.code.includes("DEFER_OR_WAIVE")
  );
}
