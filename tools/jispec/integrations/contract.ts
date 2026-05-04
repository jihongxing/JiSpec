export const EXTERNAL_INTEGRATION_CONTRACT_VERSION = 1;

export type ExternalIntegrationPayloadRole =
  | "external_coding_tool_request"
  | "scm_comment_preview"
  | "issue_link_preview";

export type ExternalIntegrationMediatedCheck = "scope_check" | "tests" | "verify";

export interface ExternalIntegrationContract {
  integrationContractVersion: 1;
  payloadRole: ExternalIntegrationPayloadRole;
  localArtifactsRemainSourceOfTruth: true;
  previewOnly: true;
  sourceUploadRequired: false;
  requiredReturnPath: "implement_external_patch";
  mediatedChecks: ["scope_check", "tests", "verify"];
}

export type LocalArtifactRefKind =
  | "verify_report"
  | "verify_summary"
  | "waiver_record"
  | "spec_debt"
  | "implementation_handoff"
  | "console_governance"
  | "multi_repo_governance"
  | "repo_group_config"
  | "local_governance_artifact";

export interface LocalArtifactRef {
  path: string;
  kind: LocalArtifactRefKind;
  sourceOfTruth: true;
  shareableAsReference: true;
}

export function buildExternalIntegrationContract(
  payloadRole: ExternalIntegrationPayloadRole,
): ExternalIntegrationContract {
  return {
    integrationContractVersion: EXTERNAL_INTEGRATION_CONTRACT_VERSION,
    payloadRole,
    localArtifactsRemainSourceOfTruth: true,
    previewOnly: true,
    sourceUploadRequired: false,
    requiredReturnPath: "implement_external_patch",
    mediatedChecks: ["scope_check", "tests", "verify"],
  };
}

export function buildLocalArtifactRefs(sourceArtifacts: string[]): LocalArtifactRef[] {
  return sourceArtifacts
    .map((artifactPath) => ({
      path: normalizePath(artifactPath),
      kind: inferLocalArtifactKind(artifactPath),
      sourceOfTruth: true as const,
      shareableAsReference: true as const,
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function inferLocalArtifactKind(artifactPath: string): LocalArtifactRefKind {
  const normalized = normalizePath(artifactPath);
  if (normalized === ".jispec-ci/verify-report.json") {
    return "verify_report";
  }
  if (normalized === ".spec/handoffs/verify-summary.md") {
    return "verify_summary";
  }
  if (normalized.startsWith(".spec/waivers/")) {
    return "waiver_record";
  }
  if (normalized.startsWith(".spec/spec-debt/")) {
    return "spec_debt";
  }
  if (normalized.startsWith(".jispec/handoff/")) {
    return "implementation_handoff";
  }
  if (normalized === ".spec/console/multi-repo-governance.json" || normalized === ".spec/console/multi-repo-governance.md") {
    return "multi_repo_governance";
  }
  if (normalized === ".spec/console/repo-group.yaml") {
    return "repo_group_config";
  }
  if (normalized.startsWith(".spec/console/")) {
    return "console_governance";
  }
  return "local_governance_artifact";
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}
