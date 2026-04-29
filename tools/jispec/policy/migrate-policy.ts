import { createFactsContract } from "../facts/facts-contract";
import {
  policyFileExists,
  readPolicyDocument,
  resolvePolicyPath,
  writeVerifyPolicy,
} from "./policy-loader";
import { validateVerifyPolicy, type VerifyPolicy } from "./policy-schema";

export interface PolicyMigrationResult {
  path: string;
  created: boolean;
  updated: boolean;
  changes: string[];
  policy: VerifyPolicy;
}

/**
 * Create a minimal starter policy pinned to the current facts contract.
 */
export function createStarterVerifyPolicy(): VerifyPolicy {
  const contract = createFactsContract();

  return {
    version: 1,
    requires: {
      facts_contract: contract.version,
    },
    team: {
      profile: "small_team",
      owner: "unassigned",
      reviewers: [],
    },
    rules: [
      {
        id: "no-blocking-issues",
        enabled: true,
        action: "fail_blocking",
        message: "Repository has blocking verify issues",
        when: {
          fact: "verify.blocking_issue_count",
          op: ">",
          value: 0,
        },
      },
      {
        id: "require-domain-contract",
        enabled: true,
        action: "warn",
        message: "Domain contract is missing",
        when: {
          not: {
            fact: "contracts.domain.present",
            op: "==",
            value: true,
          },
        },
      },
      {
        id: "require-api-contract",
        enabled: true,
        action: "warn",
        message: "API contract is missing",
        when: {
          not: {
            fact: "contracts.api.present",
            op: "==",
            value: true,
          },
        },
      },
      {
        id: "require-behavior-contract",
        enabled: true,
        action: "warn",
        message: "Behavior contract is missing",
        when: {
          not: {
            fact: "contracts.behavior.present",
            op: "==",
            value: true,
          },
        },
      },
    ],
  };
}

/**
 * Normalize an on-disk verify policy onto the current minimal policy surface.
 * If the file is missing, a starter policy is scaffolded.
 */
export function migrateVerifyPolicy(root: string, filePath?: string): PolicyMigrationResult {
  const contract = createFactsContract();
  const targetPath = resolvePolicyPath(root, filePath);
  const exists = policyFileExists(root, filePath);
  const changes: string[] = [];
  const basePolicy = exists ? loadPolicyForMigration(targetPath, changes) : null;

  let nextPolicy = basePolicy ?? createStarterVerifyPolicy();

  if (!exists) {
    changes.push("Scaffolded a starter policy");
  }

  if (!nextPolicy.team) {
    changes.push("Added minimal team profile");
  }

  if (nextPolicy.requires?.facts_contract !== contract.version) {
    changes.push(`Pinned requires.facts_contract to ${contract.version}`);
  }

  nextPolicy = {
    ...nextPolicy,
    requires: {
      ...(nextPolicy.requires ?? {}),
      facts_contract: contract.version,
    },
    team: {
      profile: nextPolicy.team?.profile ?? "small_team",
      owner: nextPolicy.team?.owner ?? "unassigned",
      reviewers: nextPolicy.team?.reviewers ?? [],
    },
  };

  writeVerifyPolicy(root, nextPolicy, filePath);

  return {
    path: targetPath,
    created: !exists,
    updated: !exists || changes.length > 0,
    changes,
    policy: nextPolicy,
  };
}

function loadPolicyForMigration(policyPath: string, changes: string[]): VerifyPolicy {
  const raw = readPolicyDocument(policyPath);
  const normalized = normalizeDeprecatedPolicyKeys(raw, changes);
  return validateVerifyPolicy(normalized);
}

function normalizeDeprecatedPolicyKeys(policy: unknown, changes: string[]): unknown {
  if (!isRecord(policy)) {
    return policy;
  }

  const next: Record<string, unknown> = { ...policy };

  if ("facts_contract" in next) {
    const requires = isRecord(next.requires) ? { ...next.requires } : {};
    if (requires.facts_contract === undefined) {
      requires.facts_contract = next.facts_contract;
      changes.push("Migrated deprecated facts_contract to requires.facts_contract");
    }
    delete next.facts_contract;
    next.requires = requires;
  }

  if (isRecord(next.requires) && "factsContract" in next.requires) {
    const requires = { ...next.requires };
    if (requires.facts_contract === undefined) {
      requires.facts_contract = requires.factsContract;
      changes.push("Migrated deprecated requires.factsContract to requires.facts_contract");
    }
    delete requires.factsContract;
    next.requires = requires;
  }

  if ("team_profile" in next) {
    const team = isRecord(next.team) ? { ...next.team } : {};
    if (team.profile === undefined) {
      team.profile = next.team_profile;
      changes.push("Migrated deprecated team_profile to team.profile");
    }
    delete next.team_profile;
    next.team = team;
  }

  return next;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function renderPolicyMigrationText(result: PolicyMigrationResult): string {
  const lines = [
    `Policy path: ${result.path}`,
    result.created ? "Result: created" : result.updated ? "Result: updated" : "Result: already current",
  ];

  if (result.changes.length === 0) {
    lines.push("Changes: none");
  } else {
    lines.push("Changes:");
    for (const change of result.changes) {
      lines.push(`- ${change}`);
    }
  }

  return lines.join("\n");
}
