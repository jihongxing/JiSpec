import { findLatestDisciplineReport } from "../discipline/artifacts";
import type { VerifyIssue } from "./verdict";
import type { VerifyRunOptions, VerifySupplementalCollector } from "./verify-runner";

export const agentDisciplineCollector: VerifySupplementalCollector = {
  source: "agent-discipline",
  collect(root: string, _options: VerifyRunOptions): VerifyIssue[] {
    const latest = findLatestDisciplineReport(root);
    if (!latest) {
      return [];
    }
    const issues: VerifyIssue[] = [];
    const report = latest.report;
    if (report.phaseGate.status === "failed") {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_PHASE_GATE", latest.path, `Agent discipline phase gate has ${report.phaseGate.issues.length} issue(s).`));
    }
    if (report.testStrategy.status === "failed" || report.testStrategy.ownerReviewRequired) {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_TEST_STRATEGY", latest.path, "Agent discipline test strategy needs deterministic verification or owner review."));
    }
    if (report.completion.status === "blocked" || report.completion.status === "incomplete" || report.completion.status === "owner_review_required") {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_INCOMPLETE", latest.path, `Agent discipline completion is ${report.completion.status}.`));
    }
    if (report.isolation.unexpectedPaths.length > 0) {
      issues.push(toIssue(report, "AGENT_DISCIPLINE_SCOPE", latest.path, `Agent discipline recorded unexpected paths: ${report.isolation.unexpectedPaths.join(", ")}.`));
    }
    return issues;
  },
};

function toIssue(report: { mode: "strict_gate" | "fast_advisory" }, code: string, path: string, message: string): VerifyIssue {
  return {
    code,
    severity: report.mode === "strict_gate" ? "blocking" : "advisory",
    kind: "unsupported",
    path,
    message,
    details: {
      source: "agent-discipline",
      disciplineMode: report.mode,
      blockingAuthority: report.mode === "strict_gate"
        ? "Strict agent discipline failures block through deterministic verify."
        : "Fast advisory discipline findings do not block merge by themselves.",
    },
  };
}
