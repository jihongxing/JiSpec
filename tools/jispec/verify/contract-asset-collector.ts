import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { loadBootstrapTakeoverReport } from "../bootstrap/takeover";
import { normalizeEvidencePath } from "../bootstrap/evidence-graph";
import type { DraftArtifactKind } from "../bootstrap/draft";
import type { VerifyIssue } from "./verdict";

const CONTRACT_FILE_BY_KIND: Record<DraftArtifactKind, string> = {
  domain: ".spec/contracts/domain.yaml",
  api: ".spec/contracts/api_spec.json",
  feature: ".spec/contracts/behaviors.feature",
};

export function collectContractAssetIssues(rootInput: string): VerifyIssue[] {
  const root = path.resolve(rootInput);
  const takeover = loadBootstrapTakeoverReport(root);
  const issues: VerifyIssue[] = [];

  for (const [artifactKind, relativePath] of Object.entries(CONTRACT_FILE_BY_KIND) as Array<[DraftArtifactKind, string]>) {
    const resolvedPath = path.join(root, relativePath);
    if (!fs.existsSync(resolvedPath)) {
      continue;
    }

    try {
      const content = fs.readFileSync(resolvedPath, "utf-8");
      if (artifactKind === "domain") {
        issues.push(...validateDomainContract(relativePath, content));
      } else if (artifactKind === "api") {
        issues.push(...validateApiContract(relativePath, content));
      } else {
        issues.push(...validateFeatureContract(relativePath, content));
      }
    } catch (error) {
      issues.push({
        kind: "runtime_error",
        severity: "nonblocking_error",
        code: "CONTRACT_ASSET_READ_FAILED",
        path: relativePath,
        message: `Failed to read adopted contract asset ${relativePath}: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  }

  if (takeover?.status === "committed") {
    const expectedPaths = new Set(takeover.baselineHandoff.expectedContractPaths);
    for (const expectedPath of expectedPaths) {
      if (!fs.existsSync(path.join(root, expectedPath))) {
        continue;
      }

      const matchingDecision = takeover.decisions.find((decision) => decision.targetPath === expectedPath);
      if (!matchingDecision) {
        issues.push({
          kind: "semantic",
          severity: "blocking",
          code: "BOOTSTRAP_TAKEOVER_DECISION_MISSING",
          path: expectedPath,
          message: "Bootstrap takeover marked this contract as adopted, but the decision log no longer explains how it entered verify scope.",
        });
      }
    }
  }

  return issues.sort((left, right) => {
    const codeCompare = left.code.localeCompare(right.code);
    if (codeCompare !== 0) {
      return codeCompare;
    }
    return (left.path ?? "").localeCompare(right.path ?? "");
  });
}

function validateDomainContract(relativePath: string, content: string): VerifyIssue[] {
  const issues: VerifyIssue[] = [];
  let parsed: unknown;

  try {
    parsed = yaml.load(content);
  } catch (error) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "DOMAIN_CONTRACT_INVALID_YAML",
        path: relativePath,
        message: `Domain contract is not valid YAML: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  if (!isRecord(parsed)) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "DOMAIN_CONTRACT_INVALID_SHAPE",
        path: relativePath,
        message: "Domain contract must deserialize to an object with metadata and domain sections.",
      },
    ];
  }

  if (!isRecord(parsed.metadata)) {
    issues.push({
      kind: "schema",
      severity: "blocking",
      code: "DOMAIN_CONTRACT_METADATA_MISSING",
      path: relativePath,
      message: "Domain contract is missing its metadata section.",
    });
  }

  if (!isRecord(parsed.domain)) {
    issues.push({
      kind: "schema",
      severity: "blocking",
      code: "DOMAIN_CONTRACT_SECTION_MISSING",
      path: relativePath,
      message: "Domain contract is missing its domain section.",
    });
  }

  return issues;
}

function validateApiContract(relativePath: string, content: string): VerifyIssue[] {
  let parsed: unknown;

  try {
    parsed = JSON.parse(content) as unknown;
  } catch (error) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "API_CONTRACT_INVALID_JSON",
        path: relativePath,
        message: `API contract is not valid JSON: ${error instanceof Error ? error.message : String(error)}`,
      },
    ];
  }

  if (!isRecord(parsed) || !isRecord(parsed.api_spec)) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "API_CONTRACT_SECTION_MISSING",
        path: relativePath,
        message: "API contract must contain an api_spec object.",
      },
    ];
  }

  const endpoints = parsed.api_spec.endpoints;
  if (!Array.isArray(endpoints) || endpoints.length === 0) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "API_CONTRACT_ENDPOINTS_MISSING",
        path: relativePath,
        message: "API contract must contain at least one endpoint for verify to gate deterministically.",
      },
    ];
  }

  return [];
}

function validateFeatureContract(relativePath: string, content: string): VerifyIssue[] {
  const scenarios = content.match(/^\s*Scenario:/gm) ?? [];
  if (scenarios.length === 0) {
    return [
      {
        kind: "schema",
        severity: "blocking",
        code: "FEATURE_CONTRACT_SCENARIOS_MISSING",
        path: relativePath,
        message: "Behavior contract must contain at least one Scenario to remain reviewable in verify.",
      },
    ];
  }

  return [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function isContractScopedPath(repoRelativePath: string): boolean {
  const normalized = normalizeEvidencePath(repoRelativePath);
  return normalized.startsWith(".spec/contracts/") || normalized === ".spec/handoffs/bootstrap-takeover.json";
}
