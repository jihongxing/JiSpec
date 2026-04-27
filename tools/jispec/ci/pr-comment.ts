import { inferNextAction, selectHighlightedIssues, type VerifyReport } from "./verify-report";

export interface PrCommentRenderOptions {
  includeIssueTable?: boolean;
  includeConsoleLink?: boolean;
  maxIssues?: number;
}

/**
 * Render PR/MR comment as Markdown.
 */
export function renderPrCommentMarkdown(
  report: VerifyReport,
  options?: PrCommentRenderOptions,
): string {
  const opts = {
    includeIssueTable: true,
    includeConsoleLink: true,
    maxIssues: 5,
    ...options,
  };

  const lines: string[] = [];

  // Header with verdict
  const icon = report.ok ? "✅" : "❌";
  lines.push(`## ${icon} JiSpec Verify: ${report.verdict}`);
  lines.push("");

  // Summary counts
  lines.push(`**Issues:** ${report.counts.total} total`);
  if (report.counts.blocking > 0) {
    lines.push(`- 🔴 ${report.counts.blocking} blocking`);
  }
  if (report.counts.advisory > 0) {
    lines.push(`- 🟡 ${report.counts.advisory} advisory`);
  }
  if (report.counts.nonblockingError > 0) {
    lines.push(`- ⚠️ ${report.counts.nonblockingError} non-blocking errors`);
  }
  lines.push("");

  // Issue table
  if (opts.includeIssueTable && report.counts.total > 0) {
    lines.push("### Top Issues");
    lines.push("");
    lines.push(renderIssueTable(report, opts.maxIssues));
    lines.push("");
  }

  // Next action
  lines.push("### Next Action");
  lines.push("");
  lines.push(renderNextActionBlock(report));
  lines.push("");

  // Deep links
  if (opts.includeConsoleLink) {
    const deepLink = buildDeepLinkPlaceholder(report, opts);
    if (deepLink) {
      lines.push("---");
      lines.push("");
      lines.push(deepLink);
      lines.push("");
    }
  }

  // Footer
  lines.push("---");
  lines.push(`_Generated at ${report.generatedAt}_`);

  return lines.join("\n");
}

/**
 * Build deep link placeholder for console/waiver.
 */
export function buildDeepLinkPlaceholder(
  report: VerifyReport,
  options?: PrCommentRenderOptions,
): string | null {
  const { context, links } = report;

  // If we have explicit links, use them
  if (links?.consoleUrl || links?.waiverUrl) {
    const parts: string[] = [];
    if (links.consoleUrl) {
      parts.push(`[View in JiSpec Console](${links.consoleUrl})`);
    }
    if (links.waiverUrl) {
      parts.push(`[Create Waiver](${links.waiverUrl})`);
    }
    return parts.join(" | ");
  }

  // Otherwise, build placeholder links if we have context
  if (!context.repoSlug) {
    return null;
  }

  const parts: string[] = [];

  // Console link placeholder
  const consoleUrl = `https://console.jispec.dev/repos/${context.repoSlug}/verify`;
  parts.push(`[View in JiSpec Console](${consoleUrl})`);

  // Waiver link placeholder (only if there are blocking issues)
  if (report.counts.blocking > 0) {
    let waiverUrl = `https://console.jispec.dev/repos/${context.repoSlug}/waivers/new`;
    if (context.pullRequestNumber) {
      waiverUrl += `?pr=${context.pullRequestNumber}`;
    } else if (context.mergeRequestIid) {
      waiverUrl += `?mr=${context.mergeRequestIid}`;
    }
    parts.push(`[Create Waiver](${waiverUrl})`);
  }

  return parts.join(" | ");
}

/**
 * Render issue table.
 */
function renderIssueTable(report: VerifyReport, maxIssues: number): string {
  const lines: string[] = [];
  const highlighted = selectHighlightedIssues(report, maxIssues);

  lines.push("| Severity | Code | Path | Message |");
  lines.push("|----------|------|------|---------|");

  for (const issue of highlighted) {
    const severity = getSeverityBadge(issue.severity);
    const path = issue.path ? `\`${issue.path}\`` : "-";
    const message = issue.message.length > 80 ? issue.message.substring(0, 77) + "..." : issue.message;
    lines.push(`| ${severity} | \`${issue.code}\` | ${path} | ${message} |`);
  }

  if (report.counts.total > highlighted.length) {
    lines.push("");
    lines.push(`_... and ${report.counts.total - highlighted.length} more issue(s). See full report for details._`);
  }

  return lines.join("\n");
}

/**
 * Render next action block.
 */
function renderNextActionBlock(report: VerifyReport): string {
  return inferNextAction(report);
}

/**
 * Get severity badge.
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
