import { appendAuditEvent } from "../audit/event-ledger";
import { createFactsContract } from "../facts/facts-contract";
import {
  applyPolicyPresetOverrides,
  getPolicyPreset,
  type PolicyPresetDefinition,
  type PolicyPresetId,
} from "./policy-presets";
import {
  policyFileExists,
  readPolicyDocument,
  resolvePolicyPath,
  writeVerifyPolicy,
} from "./policy-loader";
import { applyPolicyProfileDefaults, createStarterVerifyPolicy } from "./profile-defaults";
import { validateVerifyPolicy, type TeamPolicyProfileName, type VerifyPolicy } from "./policy-schema";

export interface PolicyMigrationResult {
  path: string;
  created: boolean;
  updated: boolean;
  changes: string[];
  policy: VerifyPolicy;
  preset?: {
    id: PolicyPresetId;
    label: string;
    baseProfile: TeamPolicyProfileName;
    useCases: string[];
    overrideSummary: string[];
  };
}

export interface PolicyMigrationAuditOptions {
  actor?: string;
  reason?: string;
  profile?: TeamPolicyProfileName;
  preset?: PolicyPresetId;
  owner?: string;
  reviewers?: string[];
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
  const preset = audit?.preset ? getPolicyPreset(audit.preset) : undefined;
  const requestedProfile = resolveRequestedProfile(basePolicy, audit?.profile, preset);
  const requestedOwner = audit?.owner;
  const requestedReviewers = audit?.reviewers;
  const previousOwner = basePolicy?.team?.owner;
  const previousReviewers = basePolicy?.team?.reviewers ?? [];

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
      owner: requestedOwner ?? nextPolicy.team?.owner ?? "unassigned",
      reviewers: requestedReviewers ?? nextPolicy.team?.reviewers ?? [],
      required_reviewers: nextPolicy.team?.required_reviewers,
    },
  }, requestedProfile, changes);

  if (preset) {
    nextPolicy = applyPolicyPresetOverrides(nextPolicy, preset);
    changes.push(`Applied preset ${preset.id} (${preset.baseProfile})`);
  }

  if (requestedOwner !== undefined && previousOwner !== requestedOwner) {
    changes.push(`Set team owner to ${requestedOwner}`);
  }
  if (requestedReviewers !== undefined && !sameStringList(previousReviewers, requestedReviewers)) {
    const reviewerList = requestedReviewers.length > 0 ? requestedReviewers.join(", ") : "none";
    changes.push(`Set team reviewers to ${reviewerList}`);
  }

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
      preset: preset
        ? {
            id: preset.id,
            label: preset.label,
            baseProfile: preset.baseProfile,
            useCases: preset.useCases,
            overrideSummary: summarizePresetOverrides(preset),
          }
        : undefined,
    },
  });

  return {
    path: targetPath,
    created: !exists,
    updated: !exists || changes.length > 0,
    changes,
    policy: nextPolicy,
    preset: preset
      ? {
          id: preset.id,
          label: preset.label,
          baseProfile: preset.baseProfile,
          useCases: preset.useCases,
          overrideSummary: summarizePresetOverrides(preset),
        }
      : undefined,
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

function resolveRequestedProfile(
  basePolicy: VerifyPolicy | null,
  explicitProfile: TeamPolicyProfileName | undefined,
  preset: PolicyPresetDefinition | undefined,
): TeamPolicyProfileName {
  if (preset && explicitProfile && explicitProfile !== preset.baseProfile) {
    throw new Error(`--profile ${explicitProfile} conflicts with preset ${preset.id} base profile ${preset.baseProfile}`);
  }
  return explicitProfile ?? preset?.baseProfile ?? basePolicy?.team?.profile ?? "small_team";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sameStringList(left: string[], right: string[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((entry, index) => entry === right[index]);
}

export function renderPolicyMigrationText(result: PolicyMigrationResult): string {
  const lines = [
    `Policy path: ${result.path}`,
    result.created ? "Result: created" : result.updated ? "Result: updated" : "Result: already current",
  ];

  if (result.preset) {
    lines.push(`Using preset '${result.preset.id}' (base profile: ${result.preset.baseProfile})`);
    if (result.preset.overrideSummary.length > 0) {
      lines.push("Applying preset overrides:");
      for (const override of result.preset.overrideSummary) {
        lines.push(`- ${override}`);
      }
    }
  }

  if (result.changes.length === 0) {
    lines.push("Changes: none");
  } else {
    lines.push("Changes:");
    for (const change of result.changes) {
      lines.push(`- ${change}`);
    }
  }

  lines.push("Next steps:");
  lines.push("- Review .spec/policy.yaml");
  lines.push("- Run: npm run jispec-cli -- doctor mainline");

  return lines.join("\n");
}

function summarizePresetOverrides(preset: PolicyPresetDefinition): string[] {
  const lines: string[] = [];
  const overrides = preset.policyOverrides;

  if (overrides.team?.required_reviewers !== undefined) {
    lines.push(`team.required_reviewers = ${overrides.team.required_reviewers}`);
  }
  if (overrides.waivers?.max_active_days !== undefined) {
    lines.push(`waivers.max_active_days = ${overrides.waivers.max_active_days}`);
  }
  if (overrides.waivers?.require_expiration !== undefined) {
    lines.push(`waivers.require_expiration = ${overrides.waivers.require_expiration}`);
  }
  if (overrides.waivers?.unmatched_active_severity !== undefined) {
    lines.push(`waivers.unmatched_active_severity = ${overrides.waivers.unmatched_active_severity}`);
  }
  if (overrides.release?.require_compare !== undefined) {
    lines.push(`release.require_compare = ${overrides.release.require_compare}`);
  }
  if (overrides.release?.policy_drift_severity !== undefined) {
    lines.push(`release.policy_drift_severity = ${overrides.release.policy_drift_severity}`);
  }
  if (overrides.release?.static_collector_drift_severity !== undefined) {
    lines.push(`release.static_collector_drift_severity = ${overrides.release.static_collector_drift_severity}`);
  }
  if (overrides.release?.contract_graph_drift_severity !== undefined) {
    lines.push(`release.contract_graph_drift_severity = ${overrides.release.contract_graph_drift_severity}`);
  }
  if (overrides.execute_default?.allowed !== undefined) {
    lines.push(`execute_default.allowed = ${overrides.execute_default.allowed}`);
  }
  if (overrides.execute_default?.require_clean_verify !== undefined) {
    lines.push(`execute_default.require_clean_verify = ${overrides.execute_default.require_clean_verify}`);
  }
  if (overrides.execute_default?.max_cost_usd !== undefined) {
    lines.push(`execute_default.max_cost_usd = ${overrides.execute_default.max_cost_usd}`);
  }
  if (overrides.execute_default?.max_iterations !== undefined) {
    lines.push(`execute_default.max_iterations = ${overrides.execute_default.max_iterations}`);
  }
  if (overrides.greenfield?.review_gate?.low_confidence_blocks !== undefined) {
    lines.push(`greenfield.review_gate.low_confidence_blocks = ${overrides.greenfield.review_gate.low_confidence_blocks}`);
  }

  return lines;
}

export { createStarterVerifyPolicy } from "./profile-defaults";
