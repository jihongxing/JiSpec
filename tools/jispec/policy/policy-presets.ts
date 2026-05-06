import {
  validateVerifyPolicy,
  type ExecuteDefaultPolicy,
  type GreenfieldReviewGatePolicy,
  type PolicyRule,
  type ReleasePolicy,
  type TeamPolicyProfileName,
  type VerifyPolicy,
  type WaiverPolicy,
} from "./policy-schema";
import { createStarterVerifyPolicy } from "./profile-defaults";

export type PolicyPresetId =
  | "fintech"
  | "startup-fast-iteration"
  | "sox-compliance"
  | "saas-default"
  | "open-source-maintainer";

export interface PolicyPresetOverrides {
  team?: {
    required_reviewers?: number;
  };
  waivers?: WaiverPolicy;
  release?: ReleasePolicy;
  execute_default?: ExecuteDefaultPolicy;
  greenfield?: {
    review_gate?: GreenfieldReviewGatePolicy;
  };
  rules?: PolicyRule[];
}

export interface PolicyPresetDefinition {
  id: PolicyPresetId;
  label: string;
  baseProfile: TeamPolicyProfileName;
  description: string;
  useCases: string[];
  policyOverrides: PolicyPresetOverrides;
}

const POLICY_PRESETS: readonly PolicyPresetDefinition[] = [
  {
    id: "fintech",
    label: "Fintech",
    baseProfile: "regulated",
    description: "For teams that need stronger contract drift control, tighter waivers, and conservative execute posture.",
    useCases: ["financial systems", "change control", "audit-heavy delivery"],
    policyOverrides: {
      waivers: {
        require_expiration: true,
        max_active_days: 21,
        unmatched_active_severity: "blocking",
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        policy_drift_severity: "blocking",
        contract_graph_drift_severity: "blocking",
        behavior_drift_severity: "advisory",
      },
      execute_default: {
        allowed: true,
        require_clean_verify: true,
        max_cost_usd: 2,
        max_iterations: 5,
      },
    },
  },
  {
    id: "startup-fast-iteration",
    label: "Startup Fast Iteration",
    baseProfile: "small_team",
    description: "For small product teams that want light governance with room to move quickly.",
    useCases: ["rapid iteration", "small engineering team", "early-stage product loops"],
    policyOverrides: {
      waivers: {
        require_expiration: false,
        max_active_days: 90,
        unmatched_active_severity: "advisory",
      },
      release: {
        require_snapshot: false,
        require_compare: false,
        policy_drift_severity: "advisory",
        contract_graph_drift_severity: "advisory",
      },
      execute_default: {
        allowed: true,
        require_clean_verify: false,
        max_cost_usd: 10,
        max_iterations: 12,
      },
    },
  },
  {
    id: "sox-compliance",
    label: "SOX Compliance",
    baseProfile: "regulated",
    description: "For audit-traceable delivery where exceptions expire quickly and automatic execution stays disabled.",
    useCases: ["SOX audit trail", "segregation of duties", "strict approval path"],
    policyOverrides: {
      team: {
        required_reviewers: 2,
      },
      waivers: {
        require_expiration: true,
        max_active_days: 14,
        unmatched_active_severity: "blocking",
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        policy_drift_severity: "blocking",
        static_collector_drift_severity: "blocking",
        contract_graph_drift_severity: "blocking",
      },
      execute_default: {
        allowed: false,
        require_clean_verify: true,
      },
    },
  },
  {
    id: "saas-default",
    label: "SaaS Default",
    baseProfile: "small_team",
    description: "For product SaaS repos that want balanced review, release comparison, and moderate execute limits.",
    useCases: ["multi-tenant applications", "ongoing product delivery", "steady release cadence"],
    policyOverrides: {
      waivers: {
        require_expiration: true,
        max_active_days: 45,
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        behavior_drift_severity: "advisory",
        contract_graph_drift_severity: "blocking",
      },
      execute_default: {
        allowed: true,
        require_clean_verify: false,
        max_cost_usd: 8,
        max_iterations: 10,
      },
    },
  },
  {
    id: "open-source-maintainer",
    label: "Open Source Maintainer",
    baseProfile: "small_team",
    description: "For maintainers who need reviewer visibility and public-facing release hygiene without a regulated lane.",
    useCases: ["community contributions", "maintainer review", "public release cadence"],
    policyOverrides: {
      waivers: {
        require_expiration: true,
        max_active_days: 45,
        unmatched_active_severity: "advisory",
      },
      release: {
        require_snapshot: true,
        require_compare: true,
        drift_requires_owner_review: true,
        policy_drift_severity: "advisory",
      },
      execute_default: {
        allowed: true,
        require_clean_verify: false,
        max_cost_usd: 5,
        max_iterations: 8,
      },
      greenfield: {
        review_gate: {
          low_confidence_blocks: true,
          conflict_blocks: true,
          blocking_review_item_blocks: true,
          deferred_or_waived_severity: "advisory",
        },
      },
    },
  },
] as const;

export function listPolicyPresets(): PolicyPresetDefinition[] {
  return [...POLICY_PRESETS];
}

export function getPolicyPreset(presetId: PolicyPresetId): PolicyPresetDefinition {
  const preset = POLICY_PRESETS.find((candidate) => candidate.id === presetId);
  if (!preset) {
    throw new Error(`Unknown policy preset: ${presetId}`);
  }
  return preset;
}

export function applyPolicyPresetOverrides(basePolicy: VerifyPolicy, preset: PolicyPresetDefinition): VerifyPolicy {
  return validateVerifyPolicy({
    ...basePolicy,
    team: {
      ...(basePolicy.team ?? {}),
      profile: preset.baseProfile,
      required_reviewers: preset.policyOverrides.team?.required_reviewers ?? basePolicy.team?.required_reviewers,
    },
    waivers: {
      ...(basePolicy.waivers ?? {}),
      ...(preset.policyOverrides.waivers ?? {}),
    },
    release: {
      ...(basePolicy.release ?? {}),
      ...(preset.policyOverrides.release ?? {}),
    },
    execute_default: {
      ...(basePolicy.execute_default ?? {}),
      ...(preset.policyOverrides.execute_default ?? {}),
    },
    greenfield: mergeGreenfieldPolicy(basePolicy.greenfield, preset.policyOverrides.greenfield),
    rules: [
      ...basePolicy.rules,
      ...(preset.policyOverrides.rules ?? []),
    ],
  });
}

export function materializePolicyPreset(presetId: PolicyPresetId): VerifyPolicy {
  const preset = getPolicyPreset(presetId);
  return applyPolicyPresetOverrides(createStarterVerifyPolicy(preset.baseProfile), preset);
}

function mergeGreenfieldPolicy(
  baseGreenfield: VerifyPolicy["greenfield"],
  overrideGreenfield: PolicyPresetOverrides["greenfield"],
): VerifyPolicy["greenfield"] {
  if (!baseGreenfield && !overrideGreenfield) {
    return undefined;
  }

  return {
    ...(baseGreenfield ?? {}),
    ...(overrideGreenfield ?? {}),
    review_gate: {
      ...(baseGreenfield?.review_gate ?? {}),
      ...(overrideGreenfield?.review_gate ?? {}),
    },
  };
}
