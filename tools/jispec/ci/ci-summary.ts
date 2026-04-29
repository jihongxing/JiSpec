import { inferNextAction, selectHighlightedIssues, type VerifyReport } from "./verify-report";
import { renderGreenfieldControlContext } from "./verify-summary";

/**
 * Render CI summary as plain text for terminal/logs.
 */
export function renderCiSummaryText(report: VerifyReport): string {
  const lines: string[] = [];

  // Verdict
  lines.push(`JiSpec Verify: ${report.verdict}`);
  lines.push("");

  // Counts
  lines.push(renderCountsLine(report));
  lines.push("");

  if (report.factsContractVersion) {
    lines.push(`Facts Contract: ${report.factsContractVersion}`);
  }
  if (Array.isArray(report.matchedPolicyRules) && report.matchedPolicyRules.length > 0) {
    lines.push(`Matched Policy Rules: ${report.matchedPolicyRules.join(", ")}`);
  }
  if (report.factsContractVersion || (Array.isArray(report.matchedPolicyRules) && report.matchedPolicyRules.length > 0)) {
    lines.push("");
  }

  const greenfieldContext = renderGreenfieldControlContext(report);
  if (greenfieldContext.length > 0) {
    lines.push("Greenfield Control Context:");
    for (const line of greenfieldContext) {
      lines.push(`  ${line.replace(/^- /, "")}`);
    }
    lines.push("");
  }

  // Highlighted issues
  if (report.counts.total > 0) {
    lines.push("Top Issues:");
    const highlighted = selectHighlightedIssues(report, 5);
    for (const issue of highlighted) {
      const location = issue.path ? ` (${issue.path})` : "";
      lines.push(`  [${issue.severity}] ${issue.code}${location}: ${issue.message}`);
    }

    if (report.counts.total > highlighted.length) {
      lines.push(`  ... and ${report.counts.total - highlighted.length} more issue(s)`);
    }
    lines.push("");
  }

  // Next action
  lines.push(`Next Action: ${inferNextAction(report)}`);

  if (report.links?.consoleUrl || report.links?.waiverUrl) {
    lines.push("");
    lines.push("Links:");
    if (report.links.consoleUrl) {
      lines.push(`  Console: ${report.links.consoleUrl}`);
    }
    if (report.links.waiverUrl) {
      lines.push(`  Waiver: ${report.links.waiverUrl}`);
    }
  }

  return lines.join("\n");
}

/**
 * Render CI summary as Markdown for GitHub Step Summary.
 */
export function renderCiSummaryMarkdown(report: VerifyReport): string {
  const lines: string[] = [];

  // Verdict header
  const icon = report.ok ? "✅" : "❌";
  lines.push(`# ${icon} JiSpec Verify: ${report.verdict}`);
  lines.push("");

  // Counts table
  lines.push("## Summary");
  lines.push("");
  lines.push("| Metric | Count |");
  lines.push("|--------|-------|");
  lines.push(`| Total Issues | ${report.counts.total} |`);
  lines.push(`| Blocking | ${report.counts.blocking} |`);
  lines.push(`| Advisory | ${report.counts.advisory} |`);
  lines.push(`| Non-blocking Errors | ${report.counts.nonblockingError} |`);
  lines.push("");

  if (report.factsContractVersion) {
    lines.push(`Facts contract: \`${report.factsContractVersion}\``);
    lines.push("");
  }

  if (Array.isArray(report.matchedPolicyRules) && report.matchedPolicyRules.length > 0) {
    lines.push(`Matched policy rules: ${report.matchedPolicyRules.map((rule) => `\`${rule}\``).join(", ")}`);
    lines.push("");
  }

  const greenfieldContext = renderGreenfieldControlContext(report);
  if (greenfieldContext.length > 0) {
    lines.push("## Greenfield Control Context");
    lines.push("");
    lines.push(...greenfieldContext);
    lines.push("");
  }

  // Highlighted issues
  if (report.counts.total > 0) {
    lines.push("## Top Issues");
    lines.push("");
    const highlighted = selectHighlightedIssues(report, 5);
    for (const issue of highlighted) {
      const severityBadge = getSeverityBadge(issue.severity);
      const location = issue.path ? ` \`${issue.path}\`` : "";
      lines.push(`- ${severityBadge} **${issue.code}**${location}: ${issue.message}`);
    }

    if (report.counts.total > highlighted.length) {
      lines.push("");
      lines.push(`_... and ${report.counts.total - highlighted.length} more issue(s)_`);
    }
    lines.push("");
  }

  // Next action
  lines.push("## Next Action");
  lines.push("");
  lines.push(inferNextAction(report));
  lines.push("");

  // Metadata
  if (report.modes) {
    lines.push("---");
    lines.push("");
    lines.push("_Modes:_");
    if (report.modes.baselineApplied) {
      const baselineDetail =
        typeof report.modes.baselineMatchCount === "number" ? ` (${report.modes.baselineMatchCount} matched)` : "";
      lines.push(`- Baseline applied${baselineDetail}`);
    }
    if (report.modes.observeMode) {
      const observeDetail =
        typeof report.modes.observeBlockingDowngraded === "number"
          ? ` (${report.modes.observeBlockingDowngraded} blocking downgraded)`
          : "";
      lines.push(`- Observe mode enabled${observeDetail}`);
    }
    if (report.modes.waiversApplied) {
      lines.push(`- ${report.modes.waiversApplied} waiver(s) matched; unmatched blockers remain blocking`);
    }
    if (report.modes.waiverLifecycle && typeof report.modes.waiverLifecycle === "object") {
      const lifecycle = report.modes.waiverLifecycle as Record<string, unknown>;
      lines.push(`- Waiver lifecycle: ${numberValue(lifecycle.active)} active, ${numberValue(lifecycle.expired)} expired, ${numberValue(lifecycle.revoked)} revoked, ${numberValue(lifecycle.invalid)} invalid`);
    }
  }

  if (report.links?.consoleUrl || report.links?.waiverUrl) {
    lines.push("");
    lines.push("## Links");
    lines.push("");
    if (report.links.consoleUrl) {
      lines.push(`- [JiSpec Console](${report.links.consoleUrl})`);
    }
    if (report.links.waiverUrl) {
      lines.push(`- [Create Waiver](${report.links.waiverUrl})`);
    }
  }

  return lines.join("\n");
}

function numberValue(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

/**
 * Render counts as a single line.
 */
function renderCountsLine(report: VerifyReport): string {
  return `Issues: ${report.counts.total} total (${report.counts.blocking} blocking, ${report.counts.advisory} advisory, ${report.counts.nonblockingError} errors)`;
}

/**
 * Get severity badge for Markdown.
 */
function getSeverityBadge(severity: "blocking" | "advisory" | "nonblocking_error"): string {
  switch (severity) {
    case "blocking":
      return "🔴";
    case "advisory":
      return "🟡";
    case "nonblocking_error":
      return "⚠️";
  }
}
