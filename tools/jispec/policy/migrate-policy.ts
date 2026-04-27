import { createFactsContract } from "../facts/facts-contract";
import {
  loadVerifyPolicy,
  policyFileExists,
  resolvePolicyPath,
  writeVerifyPolicy,
} from "./policy-loader";
import { type VerifyPolicy } from "./policy-schema";

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
  const basePolicy = exists ? loadVerifyPolicy(root, filePath) : null;

  let nextPolicy = basePolicy ?? createStarterVerifyPolicy();
  const changes: string[] = [];

  if (!exists) {
    changes.push("Scaffolded a starter policy");
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
