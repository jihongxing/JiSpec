import crypto from "node:crypto";
import type { CanonicalFactDefinition } from "./canonical-facts";
import { getCanonicalFactDefinitions, getStableFactKeys } from "./canonical-facts";

export interface FactsContract {
  version: string;
  facts: CanonicalFactDefinition[];
  contractHash: string;
}

export interface FactsContractCompatibility {
  compatible: boolean;
  requiredVersion: string;
  actualVersion: string;
  reason?: string;
}

/**
 * Create the current facts contract.
 */
export function createFactsContract(): FactsContract {
  const facts = getCanonicalFactDefinitions();
  const version = "1.0";

  return {
    version,
    facts,
    contractHash: computeFactsContractHash({ version, facts }),
  };
}

/**
 * Compute a stable hash of the facts contract.
 */
export function computeFactsContractHash(contract: Omit<FactsContract, "contractHash">): string {
  const normalized = {
    version: contract.version,
    facts: contract.facts
      .map((f) => ({ key: f.key, stability: f.stability, description: f.description }))
      .sort((a, b) => a.key.localeCompare(b.key)),
  };

  const content = JSON.stringify(normalized);
  return crypto.createHash("sha256").update(content).digest("hex");
}

/**
 * Check if a required contract version is compatible with the actual version.
 */
export function checkFactsContractCompatibility(
  requiredVersion: string,
  actualVersion: string,
): FactsContractCompatibility {
  // Simple version compatibility check
  // For now, only exact match is compatible
  // Future: implement semver-style compatibility

  if (requiredVersion === actualVersion) {
    return {
      compatible: true,
      requiredVersion,
      actualVersion,
    };
  }

  return {
    compatible: false,
    requiredVersion,
    actualVersion,
    reason: `Contract version mismatch: required ${requiredVersion}, actual ${actualVersion}`,
  };
}

/**
 * Get all stable fact keys from the contract.
 */
export function getStableFactKeysFromContract(contract: FactsContract): string[] {
  return contract.facts.filter((f) => f.stability === "stable").map((f) => f.key);
}

/**
 * Validate that a policy only references stable facts.
 */
export function validatePolicyUsesStableFacts(
  policyFactKeys: string[],
  contract: FactsContract,
): { valid: boolean; invalidKeys: string[] } {
  const stableKeys = new Set(getStableFactKeysFromContract(contract));
  const invalidKeys = policyFactKeys.filter((key) => !stableKeys.has(key));

  return {
    valid: invalidKeys.length === 0,
    invalidKeys,
  };
}
