import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import * as yaml from "js-yaml";
import { runGreenfieldInit } from "../greenfield/init";

export interface RequirementDefinition {
  id: string;
  statement: string;
}

export interface TechnicalSolutionOptions {
  architectureDirection?: string;
  integrationRule?: string;
  constraints?: string[];
}

export function createFixtureRoot(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

export function initializeGreenfieldProject(
  root: string,
  requirements: RequirementDefinition[],
  technicalSolutionOptions?: TechnicalSolutionOptions,
): void {
  const requirementsPath = path.join(root, "requirements.md");
  const technicalSolutionPath = path.join(root, "technical-solution.md");
  fs.writeFileSync(requirementsPath, buildRequirements(requirements), "utf-8");
  fs.writeFileSync(technicalSolutionPath, buildTechnicalSolution(technicalSolutionOptions), "utf-8");
  runGreenfieldInit({
    root,
    requirements: requirementsPath,
    technicalSolution: technicalSolutionPath,
  });
}

export function writeWorkspaceRequirements(root: string, requirements: RequirementDefinition[]): void {
  fs.writeFileSync(path.join(root, "docs", "input", "requirements.md"), buildRequirements(requirements), "utf-8");
}

export function findEvolutionItemId(
  root: string,
  changeId: string,
  predicate: (item: { evolution_id?: string; anchor_id?: string; evolution_kind?: string; predecessor_ids?: string[]; successor_ids?: string[] }) => boolean,
): string {
  const payload = JSON.parse(
    fs.readFileSync(path.join(root, ".spec", "deltas", changeId, "source-evolution.json"), "utf-8"),
  ) as {
    items?: Array<{ evolution_id?: string; anchor_id?: string; evolution_kind?: string; predecessor_ids?: string[]; successor_ids?: string[] }>;
  };
  const item = payload.items?.find(predicate);
  if (!item?.evolution_id) {
    throw new Error(`Expected source evolution item in ${changeId}.`);
  }
  return item.evolution_id;
}

export function loadLifecycle(root: string): {
  registry_version?: number;
  active_snapshot_id?: string;
  last_adopted_change_id?: string | null;
  requirements?: Array<{
    id?: string;
    status?: string;
    supersedes?: string[];
    replaced_by?: string[];
    merged_from?: string[];
    deprecated_by_change?: string | null;
    modified_by_change?: string | null;
  }>;
} {
  return yaml.load(fs.readFileSync(path.join(root, ".spec", "requirements", "lifecycle.yaml"), "utf-8")) as {
    registry_version?: number;
    active_snapshot_id?: string;
    last_adopted_change_id?: string | null;
    requirements?: Array<{
      id?: string;
      status?: string;
      supersedes?: string[];
      replaced_by?: string[];
      merged_from?: string[];
      deprecated_by_change?: string | null;
      modified_by_change?: string | null;
    }>;
  };
}

export function loadBaseline(root: string): {
  requirement_ids?: string[];
  applied_deltas?: string[];
  source_snapshot?: { last_adopted_change_id?: string | null };
  source_evolution?: { last_adopted_change_id?: string | null; source_review_path?: string };
  requirement_lifecycle?: { registry_version?: number; last_adopted_change_id?: string | null };
} {
  return yaml.load(fs.readFileSync(path.join(root, ".spec", "baselines", "current.yaml"), "utf-8")) as {
    requirement_ids?: string[];
    applied_deltas?: string[];
    source_snapshot?: { last_adopted_change_id?: string | null };
    source_evolution?: { last_adopted_change_id?: string | null; source_review_path?: string };
    requirement_lifecycle?: { registry_version?: number; last_adopted_change_id?: string | null };
  };
}

export function loadSourceReviewRecord(root: string, changeId: string): {
  items?: Array<{ evolution_id?: string; status?: string; maps_to?: string[] }>;
} {
  return yaml.load(fs.readFileSync(path.join(root, ".spec", "deltas", changeId, "source-review.yaml"), "utf-8")) as {
    items?: Array<{ evolution_id?: string; status?: string; maps_to?: string[] }>;
  };
}

export function loadAdoptionRecord(root: string, changeId: string): {
  status?: string;
  decisions?: Array<{ evolution_id?: string; status?: string; maps_to?: string[] }>;
} {
  return yaml.load(fs.readFileSync(path.join(root, ".spec", "deltas", changeId, "adoption-record.yaml"), "utf-8")) as {
    status?: string;
    decisions?: Array<{ evolution_id?: string; status?: string; maps_to?: string[] }>;
  };
}

export function buildRequirements(requirements: RequirementDefinition[]): string {
  return [
    "# Commerce Platform Requirements",
    "",
    "## Objective",
    "",
    "Build a commerce platform.",
    "",
    "## Users / Actors",
    "",
    "- Shopper",
    "",
    "## Core Journeys",
    "",
    "- Shopper checks out a cart.",
    "",
    "## Functional Requirements",
    "",
    ...requirements.flatMap((requirement) => [
      `### ${requirement.id}`,
      "",
      requirement.statement,
      "",
    ]),
    "## Non-Functional Requirements",
    "",
    "- Checkout should be responsive.",
    "",
    "## Out Of Scope",
    "",
    "- Refunds.",
    "",
    "## Acceptance Signals",
    "",
    "- Order created.",
  ].join("\n");
}

export function buildTechnicalSolution(options?: TechnicalSolutionOptions): string {
  return [
    "# Commerce Platform Technical Solution",
    "",
    "## Architecture Direction",
    "",
    options?.architectureDirection ?? "Use bounded contexts.",
    "",
    "## Bounded Context Hypothesis",
    "",
    "- ordering",
    "",
    "## Integration Boundaries",
    "",
    options?.integrationRule ?? "No direct writes across boundaries.",
    "",
    "## Data Ownership",
    "",
    "Ordering owns orders.",
    "",
    "## Testing Strategy",
    "",
    "Use unit and contract tests.",
    "",
    "## Operational Constraints",
    "",
    ...(options?.constraints ?? ["Keep synchronous checkout responsive."]),
  ].join("\n");
}
