import {
  type TraceReport,
  type ValidationIssue,
  type ValidationResult as LegacyValidationResult,
  validateRepository,
} from "../validator";
import type { VerifyIssue, VerifyIssueKind } from "./verdict";

const SCHEMA_CODES = new Set([
  "SCHEMA_MISSING",
  "SCHEMA_INVALID_JSON",
  "SCHEMA_VALIDATION_FAILED",
  "YAML_PARSE_FAILED",
]);

const MISSING_FILE_CODES = new Set([
  "FILE_MISSING",
  "ROOT_NOT_FOUND",
  "PROJECT_SOURCE_DOCUMENT_MISSING",
  "SLICE_ARTIFACT_MISSING",
  "TEST_SPEC_MISSING",
]);

export function runLegacyRepositoryValidation(root: string): VerifyIssue[] {
  return mapLegacyValidationResult(validateRepository(root));
}

export function mapLegacyValidationResult(result: LegacyValidationResult): VerifyIssue[] {
  return result.issues.map((issue) => classifyLegacyIssue(issue));
}

export function mapLegacyTraceReport(report: TraceReport): VerifyIssue[] {
  return report.validation.issues.map((issue) => classifyLegacyIssue(issue));
}

export function classifyLegacyIssue(issue: ValidationIssue): VerifyIssue {
  return {
    kind: inferLegacyIssueKind(issue),
    severity: "blocking",
    code: issue.code,
    path: issue.path || undefined,
    message: issue.message,
  };
}

function inferLegacyIssueKind(issue: ValidationIssue): VerifyIssueKind {
  if (issue.code.startsWith("TRACE_") || issue.code === "TRACE_FILE_MISSING" || issue.path.endsWith("trace.yaml")) {
    return "trace";
  }

  if (SCHEMA_CODES.has(issue.code)) {
    return "schema";
  }

  if (MISSING_FILE_CODES.has(issue.code) || issue.message.includes("does not exist") || issue.message.includes("Missing `")) {
    return "missing_file";
  }

  if (issue.code.includes("SCHEMA") || issue.message.toLowerCase().includes("schema")) {
    return "schema";
  }

  return "semantic";
}
