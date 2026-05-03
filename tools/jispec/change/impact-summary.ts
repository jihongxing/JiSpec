import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

export type ImpactGraphFreshnessStatus = "fresh" | "stale" | "not_available_yet" | "invalid";

export interface ImpactGraphFreshness {
  status: ImpactGraphFreshnessStatus;
  path: string;
  generatedAt?: string;
  reason: string;
}

export interface ChangeImpactArtifacts {
  deltaPath: string;
  impactGraphPath: string;
  impactReportPath: string;
  verifyFocusPath: string;
}

export interface ChangeImpactSummary {
  version: 1;
  changeId: string;
  artifacts: ChangeImpactArtifacts;
  impactedContracts: string[];
  impactedFiles: string[];
  missingVerificationHints: string[];
  freshness: ImpactGraphFreshness;
  nextReplayCommand: string;
  advisoryOnly: true;
}

export interface ChangeImpactSummaryInput {
  root: string;
  changeId: string;
  generatedAt?: string;
  summary?: string;
  changeType?: string;
  contextId?: string;
  sliceId?: string;
}

export function summarizeChangeImpact(input: ChangeImpactSummaryInput): ChangeImpactSummary {
  const artifacts = buildChangeImpactArtifacts(input.changeId);
  const freshness = classifyImpactFreshness(input.root, artifacts.impactGraphPath, input.generatedAt);
  const verifyFocus = readVerifyFocus(input.root, artifacts.verifyFocusPath);
  const verificationFocus = objectValue(verifyFocus.verification_focus);

  return {
    version: 1,
    changeId: input.changeId,
    artifacts,
    impactedContracts: stringArray(verificationFocus.contracts ?? verifyFocus.contracts),
    impactedFiles: stableUnique([
      ...stringArray(verificationFocus.asset_paths ?? verifyFocus.asset_paths),
      ...stringArray(objectValue(verifyFocus.dirty_propagation).dirty_asset_paths),
    ]),
    missingVerificationHints: buildMissingVerificationHints(freshness, verificationFocus),
    freshness,
    nextReplayCommand: buildNextReplayCommand(input),
    advisoryOnly: true,
  };
}

export function buildChangeImpactArtifacts(changeId: string): ChangeImpactArtifacts {
  const base = `.spec/deltas/${changeId}`;
  return {
    deltaPath: `${base}/delta.yaml`,
    impactGraphPath: `${base}/impact-graph.json`,
    impactReportPath: `${base}/impact-report.md`,
    verifyFocusPath: `${base}/verify-focus.yaml`,
  };
}

export function classifyImpactFreshness(
  rootInput: string,
  relativePath: string,
  nowInput = new Date().toISOString(),
): ImpactGraphFreshness {
  const target = path.join(path.resolve(rootInput), relativePath);
  if (!fs.existsSync(target)) {
    return {
      status: "not_available_yet",
      path: relativePath,
      reason: "Impact graph has not been generated for this change.",
    };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(target, "utf-8")) as { generatedAt?: string; generated_at?: string };
    const generatedAt = parsed.generatedAt ?? parsed.generated_at;
    if (!generatedAt) {
      return { status: "invalid", path: relativePath, reason: "Impact graph is missing generatedAt metadata." };
    }

    const ageMs = Date.parse(nowInput) - Date.parse(generatedAt);
    if (!Number.isFinite(ageMs)) {
      return { status: "invalid", path: relativePath, generatedAt, reason: "Impact graph generatedAt is not parseable." };
    }
    if (ageMs > 7 * 24 * 60 * 60 * 1000) {
      return { status: "stale", path: relativePath, generatedAt, reason: "Impact graph is older than seven days." };
    }
    return { status: "fresh", path: relativePath, generatedAt, reason: "Impact graph is available and recent." };
  } catch {
    return { status: "invalid", path: relativePath, reason: "Impact graph could not be parsed as JSON." };
  }
}

function readVerifyFocus(rootInput: string, relativePath: string): Record<string, unknown> {
  const target = path.join(path.resolve(rootInput), relativePath);
  if (!fs.existsSync(target)) {
    return {};
  }

  const parsed = yaml.load(fs.readFileSync(target, "utf-8"));
  return parsed && typeof parsed === "object" && !Array.isArray(parsed)
    ? parsed as Record<string, unknown>
    : {};
}

function buildMissingVerificationHints(
  freshness: ImpactGraphFreshness,
  verificationFocus: Record<string, unknown>,
): string[] {
  const hints: string[] = [];
  if (freshness.status !== "fresh") {
    hints.push(`Impact graph freshness is ${freshness.status}: ${freshness.reason}`);
  }
  if (stringArray(verificationFocus.contracts).length === 0) {
    hints.push("No impacted contracts are listed in verify-focus.yaml.");
  }
  if (stringArray(verificationFocus.tests).length === 0) {
    hints.push("No impacted tests are listed in verify-focus.yaml.");
  }
  return hints;
}

function buildNextReplayCommand(input: ChangeImpactSummaryInput): string {
  const parts = ["npm run jispec-cli -- change", quote(input.summary ?? "<summary>")];
  if (input.changeType) {
    parts.push("--change-type", input.changeType);
  }
  if (input.contextId) {
    parts.push("--context", input.contextId);
  }
  if (input.sliceId) {
    parts.push("--slice", input.sliceId);
  }
  parts.push("--json");
  return parts.join(" ");
}

function quote(value: string): string {
  return `"${value.replace(/"/g, '\\"')}"`;
}

function objectValue(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string")
    : [];
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}
