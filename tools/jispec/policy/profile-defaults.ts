import { createFactsContract } from "../facts/facts-contract";
import type { TeamPolicyProfileName, VerifyPolicy } from "./policy-schema";

export function createStarterVerifyPolicy(profile: TeamPolicyProfileName = "small_team"): VerifyPolicy {
  const contract = createFactsContract();
  return applyPolicyProfileDefaults({
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
}

export function createStarterRules(): VerifyPolicy["rules"] {
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
        all: [
          {
            fact: "contracts.behavior.present",
            op: "==",
            value: false,
          },
          {
            fact: "contracts.behavior.deferred",
            op: "==",
            value: false,
          },
        ],
      },
    },
  ];
}

export function applyPolicyProfileDefaults(
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

export function profileDefaults(profile: TeamPolicyProfileName): Required<Pick<VerifyPolicy, "team" | "waivers" | "release" | "execute_default">> {
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
