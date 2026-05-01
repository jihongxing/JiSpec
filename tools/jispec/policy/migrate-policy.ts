import { appendAuditEvent } from "../audit/event-ledger";
import { createFactsContract } from "../facts/facts-contract";
import {
  policyFileExists,
  readPolicyDocument,
  resolvePolicyPath,
  writeVerifyPolicy,
} from "./policy-loader";
import { validateVerifyPolicy, type TeamPolicyProfileName, type VerifyPolicy } from "./policy-schema";

export interface PolicyMigrationResult {
  path: string;
  created: boolean;
  updated: boolean;
  changes: string[];
  policy: VerifyPolicy;
}

export interface PolicyMigrationAuditOptions {
  actor?: string;
  reason?: string;
  profile?: TeamPolicyProfileName;
}

/**
 * Create a minimal starter policy pinned to the current facts contract.
 */
export function createStarterVerifyPolicy(profile: TeamPolicyProfileName = "small_team"): VerifyPolicy {
  const contract = createFactsContract();
  const policy = applyPolicyProfileDefaults({
    version: 1,
    requires: {
      facts_contract: contract.version,
    },
    team: {
      profile,
      owner: "unassigned",
      reviewers: [],
    },
    rules: createStarterRules(),
  }, profile);

  return policy;
}

function createStarterRules(): VerifyPolicy["rules"] {
  return [
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
  ];
}

/**
 * Normalize an on-disk verify policy onto the current minimal policy surface.
 * If the file is missing, a starter policy is scaffolded.
 */
export function migrateVerifyPolicy(root: string, filePath?: string, audit?: PolicyMigrationAuditOptions): PolicyMigrationResult {
  const contract = createFactsContract();
  const targetPath = resolvePolicyPath(root, filePath);
  const exists = policyFileExists(root, filePath);
  const changes: string[] = [];
  const basePolicy = exists ? loadPolicyForMigration(targetPath, changes) : null;
  const requestedProfile = audit?.profile ?? basePolicy?.team?.profile ?? "small_team";

  let nextPolicy = basePolicy ?? createStarterVerifyPolicy(requestedProfile);

  if (!exists) {
    changes.push("Scaffolded a starter policy");
  }

  if (!nextPolicy.team) {
    changes.push(`Added ${requestedProfile} team profile`);
  }

  if (nextPolicy.requires?.facts_contract !== contract.version) {
    changes.push(`Pinned requires.facts_contract to ${contract.version}`);
  }

  nextPolicy = applyPolicyProfileDefaults({
    ...nextPolicy,
    requires: {
      ...(nextPolicy.requires ?? {}),
      facts_contract: contract.version,
    },
    team: {
      profile: requestedProfile,
      owner: nextPolicy.team?.owner ?? "unassigned",
      reviewers: nextPolicy.team?.reviewers ?? [],
      required_reviewers: nextPolicy.team?.required_reviewers,
    },
  }, requestedProfile, changes);

  writeVerifyPolicy(root, nextPolicy, filePath);
  appendAuditEvent(root, {
    type: "policy_migrate",
    actor: audit?.actor,
    reason: audit?.reason ?? "Scaffold or normalize verify policy onto the current facts contract.",
    sourceArtifact: {
      kind: "verify-policy",
      path: targetPath,
    },
    affectedContracts: [".spec/policy.yaml", `facts_contract:${contract.version}`],
    details: {
      created: !exists,
      updated: !exists || changes.length > 0,
      changes,
      policyPath: targetPath,
    },
  });

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

  if ("waiver_policy" in next) {
    if (next.waivers === undefined) {
      next.waivers = next.waiver_policy;
      changes.push("Migrated deprecated waiver_policy to waivers");
    }
    delete next.waiver_policy;
  }

  if ("release_policy" in next) {
    if (next.release === undefined) {
      next.release = next.release_policy;
      changes.push("Migrated deprecated release_policy to release");
    }
    delete next.release_policy;
  }

  if ("executeDefault" in next) {
    if (next.execute_default === undefined) {
      next.execute_default = next.executeDefault;
      changes.push("Migrated deprecated executeDefault to execute_default");
    }
    delete next.executeDefault;
  }

  return next;
}

function applyPolicyProfileDefaults(
  policy: VerifyPolicy,
  profile: TeamPolicyProfileName,
  changes: string[] = [],
): VerifyPolicy {
  const defaults = profileDefaults(profile);
  const next: VerifyPolicy = {
    ...policy,
    team: {
      ...defaults.team,
      ...(policy.team ?? {}),
      profile,
      owner: policy.team?.owner ?? defaults.team.owner,
      reviewers: policy.team?.reviewers ?? defaults.team.reviewers,
      required_reviewers: policy.team?.required_reviewers ?? defaults.team.required_reviewers,
    },
    waivers: {
      ...defaults.waivers,
      ...(policy.waivers ?? {}),
    },
    release: {
      ...defaults.release,
      ...(policy.release ?? {}),
    },
    execute_default: {
      ...defaults.execute_default,
      ...(policy.execute_default ?? {}),
    },
  };

  if (!policy.waivers) {
    changes.push(`Added ${profile} waiver policy`);
  }
  if (!policy.release) {
    changes.push(`Added ${profile} release policy`);
  }
  if (!policy.execute_default) {
    changes.push(`Added ${profile} execute-default policy`);
  }
  if (policy.team?.required_reviewers === undefined) {
    changes.push(`Set ${profile} required reviewer count`);
  }

  return next;
}

function profileDefaults(profile: TeamPolicyProfileName): Required<Pick<VerifyPolicy, "team" | "waivers" | "release" | "execute_default">> {
  if (profile === "solo") {
    return {
      team: {
        profile,
        owner: "unassigned",
        reviewers: [],
        required_reviewers: 0,
      },
      waivers: {
        require_owner: true,
        require_reason: true,
        require_expiration: false,
        max_active_days: 90,
        expiring_soon_days: 14,
        unmatched_active_severity: "advisory",
      },
      release: {
        require_snapshot: false,
        require_compare: false,
        drift_requires_owner_review: true,
        policy_drift_severity: "advisory",
        static_collector_drift_severity: "advisory",
        contract_graph_drift_severity: "advisory",
      },
      execute_default: {
        allowed: true,
        require_policy: true,
        require_clear_adopt_boundary: true,
        require_clean_verify: false,
        max_cost_usd: 5,
        max_iterations: 10,
      },
    };
  }

  if (profile === "regulated") {
    return {
      team: {
        profile,
        owner: "unassigned",
        reviewers: [],
        required_reviewers: 2,
      },
      waivers: {
        require_owner: true,
        require_reason: true,
        require_expiration: true,
        max_active_days: 30,
        expiring_soon_days: 14,
        unmatched_active_severity: "blocking",
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        drift_requires_owner_review: true,
        policy_drift_severity: "blocking",
        static_collector_drift_severity: "advisory",
        contract_graph_drift_severity: "blocking",
      },
      execute_default: {
        allowed: true,
        require_policy: true,
        require_clear_adopt_boundary: true,
        require_clean_verify: true,
        max_cost_usd: 3,
        max_iterations: 6,
      },
    };
  }

  return {
    team: {
      profile: "small_team",
      owner: "unassigned",
      reviewers: [],
      required_reviewers: 1,
    },
    waivers: {
      require_owner: true,
      require_reason: true,
      require_expiration: true,
      max_active_days: 60,
      expiring_soon_days: 14,
      unmatched_active_severity: "advisory",
    },
    release: {
      require_snapshot: true,
      require_compare: true,
      drift_requires_owner_review: true,
      policy_drift_severity: "advisory",
      static_collector_drift_severity: "advisory",
      contract_graph_drift_severity: "blocking",
    },
    execute_default: {
      allowed: true,
      require_policy: true,
      require_clear_adopt_boundary: true,
      require_clean_verify: false,
      max_cost_usd: 5,
      max_iterations: 10,
    },
  };
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
