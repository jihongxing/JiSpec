import type { RawFactsSnapshot } from "./raw-facts";

export type FactStability = "stable" | "beta" | "experimental";

export interface CanonicalFactDefinition {
  key: string;
  stability: FactStability;
  description: string;
}

export interface CanonicalFactsSnapshot {
  generatedAt: string;
  repoRoot: string;
  contractVersion: string;
  facts: Record<string, unknown>;
  warnings: string[];
}

/**
 * Get all canonical fact definitions.
 * This is the contract that policies can rely on.
 */
export function getCanonicalFactDefinitions(): CanonicalFactDefinition[] {
  return [
    // Stable facts - guaranteed to be available
    {
      key: "verify.issue_count",
      stability: "stable",
      description: "Total number of verify issues",
    },
    {
      key: "verify.blocking_issue_count",
      stability: "stable",
      description: "Number of blocking verify issues",
    },
    {
      key: "verify.issue_codes",
      stability: "stable",
      description: "Array of unique issue codes found",
    },
    {
      key: "verify.contract_issue_count",
      stability: "stable",
      description: "Number of verify issues scoped to adopted contract assets",
    },
    {
      key: "greenfield.code_drift_count",
      stability: "stable",
      description: "Number of unclassified implementation facts that are not represented in the Greenfield Evidence Graph",
    },
    {
      key: "greenfield.spec_drift_count",
      stability: "stable",
      description: "Number of Greenfield Evidence Graph expectations whose referenced specification assets or coverage edges are missing",
    },
    {
      key: "greenfield.classified_drift_count",
      stability: "stable",
      description: "Number of implementation facts outside the Evidence Graph that are explicitly classified as ignored, experimental, or intentional",
    },
    {
      key: "greenfield.spec_debt_open_count",
      stability: "stable",
      description: "Number of open Greenfield spec debt records in the ledger",
    },
    {
      key: "greenfield.spec_debt_expired_count",
      stability: "stable",
      description: "Number of expired Greenfield spec debt records in the ledger",
    },
    {
      key: "greenfield.review_unresolved_blocking_count",
      stability: "stable",
      description: "Number of proposed blocking decisions in the Greenfield Initialization Review Pack",
    },
    {
      key: "greenfield.review_low_confidence_unadopted_count",
      stability: "stable",
      description: "Number of low-confidence Greenfield review decisions that remain proposed",
    },
    {
      key: "greenfield.review_rejected_count",
      stability: "stable",
      description: "Number of rejected Greenfield review decisions that have not been corrected",
    },
    {
      key: "greenfield.review_deferred_or_waived_count",
      stability: "stable",
      description: "Number of deferred or waived Greenfield review decisions",
    },
    {
      key: "greenfield.dirty_required_update_count",
      stability: "stable",
      description: "Number of unresolved required updates produced by Greenfield Deterministic Contract Graph dirty propagation",
    },
    {
      key: "greenfield.dirty_graph_warning_count",
      stability: "stable",
      description: "Number of dirty propagation warnings emitted while evaluating Greenfield Spec Deltas",
    },
    {
      key: "contracts.domain.present",
      stability: "stable",
      description: "Whether domain contract exists",
    },
    {
      key: "contracts.api.present",
      stability: "stable",
      description: "Whether API contract exists",
    },
    {
      key: "contracts.behavior.present",
      stability: "stable",
      description: "Whether behavior contract exists",
    },

    // Beta facts - defined but may not always be available
    {
      key: "bootstrap.takeover.present",
      stability: "beta",
      description: "Whether a committed bootstrap takeover handoff exists",
    },
    {
      key: "bootstrap.adopted_contract_count",
      stability: "beta",
      description: "Number of adopted bootstrap contracts tracked by the current takeover handoff",
    },
    {
      key: "bootstrap.spec_debt_count",
      stability: "beta",
      description: "Number of bootstrap spec debt records tracked by the current takeover handoff",
    },
    {
      key: "bootstrap.rejected_artifact_kinds",
      stability: "beta",
      description: "Array of bootstrap artifact kinds that were explicitly rejected during the latest takeover",
    },
    {
      key: "bootstrap.historical_debt_issue_count",
      stability: "beta",
      description: "Number of legacy repository issues downgraded to historical debt under bootstrap takeover scope",
    },
    {
      key: "api.new_endpoints",
      stability: "beta",
      description: "Array of newly added API endpoints",
    },
    {
      key: "openapi.breaking_changes",
      stability: "beta",
      description: "Array of breaking changes in OpenAPI spec",
    },
    {
      key: "bdd.missing_scenarios",
      stability: "beta",
      description: "Array of missing BDD scenarios",
    },
    {
      key: "git.changed_paths",
      stability: "beta",
      description: "Array of changed file paths",
    },
  ];
}

/**
 * Build canonical facts from raw facts snapshot.
 */
export function buildCanonicalFacts(raw: RawFactsSnapshot): CanonicalFactsSnapshot {
  const facts: Record<string, unknown> = {};
  const warnings: string[] = [...raw.warnings];

  // Map raw facts to canonical facts
  for (const record of raw.records) {
    const definition = getCanonicalFactDefinitions().find((d) => d.key === record.key);

    if (definition) {
      // This is a known canonical fact
      facts[record.key] = record.value;
    } else {
      // Unknown fact - add warning but don't fail
      warnings.push(`Unknown fact key: ${record.key} from source ${record.source}`);
    }
  }

  // Set defaults for stable facts that are missing
  const stableDefinitions = getCanonicalFactDefinitions().filter((d) => d.stability === "stable");
  for (const definition of stableDefinitions) {
    if (!(definition.key in facts)) {
      // Set sensible defaults
      if (definition.key.endsWith(".present")) {
        facts[definition.key] = false;
      } else if (definition.key.endsWith("_count")) {
        facts[definition.key] = 0;
      } else if (definition.key.endsWith("_codes")) {
        facts[definition.key] = [];
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    repoRoot: raw.repoRoot,
    contractVersion: "1.0",
    facts,
    warnings,
  };
}

/**
 * Stable sort canonical facts snapshot for consistent output.
 */
export function stableSortCanonicalFacts(snapshot: CanonicalFactsSnapshot): CanonicalFactsSnapshot {
  const sortedFacts: Record<string, unknown> = {};
  const keys = Object.keys(snapshot.facts).sort();

  for (const key of keys) {
    sortedFacts[key] = snapshot.facts[key];
  }

  return {
    ...snapshot,
    facts: sortedFacts,
    warnings: [...snapshot.warnings].sort(),
  };
}

/**
 * Get a canonical fact value by key.
 */
export function getCanonicalFactValue(snapshot: CanonicalFactsSnapshot, key: string): unknown {
  return snapshot.facts[key];
}

/**
 * Get all stable fact keys.
 */
export function getStableFactKeys(): string[] {
  return getCanonicalFactDefinitions()
    .filter((d) => d.stability === "stable")
    .map((d) => d.key);
}

/**
 * Check if a fact key is defined in the contract.
 */
export function isFactKeyDefined(key: string): boolean {
  return getCanonicalFactDefinitions().some((d) => d.key === key);
}
