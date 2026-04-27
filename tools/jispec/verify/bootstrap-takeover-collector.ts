import fs from "node:fs";
import path from "node:path";
import { loadBootstrapTakeoverReport } from "../bootstrap/takeover";
import { normalizeEvidencePath } from "../bootstrap/evidence-graph";
import type { VerifyIssue } from "./verdict";

export function collectBootstrapTakeoverIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const report = loadBootstrapTakeoverReport(root);
  if (!report || report.status !== "committed") {
    return [];
  }

  const issues: VerifyIssue[] = [];
  const manifestPath = path.join(root, report.manifestPath);
  if (!fs.existsSync(manifestPath)) {
    issues.push({
      kind: "missing_file",
      severity: "blocking",
      code: "BOOTSTRAP_MANIFEST_MISSING",
      path: report.manifestPath,
      message: "Bootstrap takeover report points to a session manifest that is no longer present.",
    });
  }

  for (const contractPath of report.baselineHandoff.expectedContractPaths) {
    const resolvedPath = path.join(root, contractPath);
    if (!fs.existsSync(resolvedPath)) {
      issues.push({
        kind: "missing_file",
        severity: "blocking",
        code: "BOOTSTRAP_CONTRACT_MISSING",
        path: contractPath,
        message: "An adopted bootstrap contract is missing from .spec/contracts and can no longer be verified deterministically.",
      });
    }
  }

  for (const specDebtPath of report.baselineHandoff.deferredSpecDebtPaths) {
    const resolvedPath = path.join(root, specDebtPath);
    if (!fs.existsSync(resolvedPath)) {
      issues.push({
        kind: "missing_file",
        severity: "blocking",
        code: "BOOTSTRAP_SPEC_DEBT_RECORD_MISSING",
        path: specDebtPath,
        message: "Bootstrap takeover deferred this artifact into spec debt, but the debt record is missing.",
      });
      continue;
    }

    issues.push({
      kind: "unsupported",
      severity: "advisory",
      code: "BOOTSTRAP_SPEC_DEBT_PENDING",
      path: specDebtPath,
      message: "Bootstrap takeover deferred this historical contract area into spec debt; review is still pending before it can become a blocking contract.",
      details: {
        matched_by: "bootstrap_takeover",
        session_id: report.sessionId,
        normalized_path: normalizeEvidencePath(specDebtPath),
      },
    });
  }

  return issues.sort((left, right) => {
    const codeCompare = left.code.localeCompare(right.code);
    if (codeCompare !== 0) {
      return codeCompare;
    }
    return (left.path ?? "").localeCompare(right.path ?? "");
  });
}
