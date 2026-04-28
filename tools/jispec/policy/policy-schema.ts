import {
  checkFactsContractCompatibility,
  getStableFactKeysFromContract,
  type FactsContract,
} from "../facts/facts-contract";

export type PolicyAction = "pass" | "warn" | "fail_blocking";

export type PolicyCondition =
  | { all: PolicyCondition[] }
  | { any: PolicyCondition[] }
  | { not: PolicyCondition }
  | { fact: string; op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "in"; value: unknown };

export interface PolicyRule {
  id: string;
  enabled: boolean;
  action: PolicyAction;
  message: string;
  when: PolicyCondition;
}

export interface VerifyPolicy {
  version: 1;
  requires?: {
    facts_contract?: string;
  };
  greenfield?: {
    review_gate?: GreenfieldReviewGatePolicy;
  };
  rules: PolicyRule[];
}

export interface GreenfieldReviewGatePolicy {
  low_confidence_blocks?: boolean;
  low_confidence_blocks_by_decision_type?: Record<string, boolean>;
  conflict_blocks?: boolean;
  blocking_review_item_blocks?: boolean;
  blocking_open_decision_types?: string[];
  rejected_blocks?: boolean;
  deferred_or_waived_severity?: "ignore" | "advisory" | "blocking";
  expired_defer_or_waive_severity?: "ignore" | "advisory" | "blocking";
}

export interface PolicyValidationIssue {
  code:
    | "POLICY_FACTS_CONTRACT_MISMATCH"
    | "POLICY_UNKNOWN_FACT"
    | "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT";
  message: string;
  ruleId?: string;
  factKeys?: string[];
}

export interface PolicyFactsContractValidationResult {
  valid: boolean;
  issues: PolicyValidationIssue[];
}

/**
 * Validate a verify policy structure.
 */
export function validateVerifyPolicy(policy: unknown): VerifyPolicy {
  if (!policy || typeof policy !== "object") {
    throw new Error("Policy must be an object");
  }

  const p = policy as Record<string, unknown>;

  if (p.version !== 1) {
    throw new Error("Policy version must be 1");
  }

  if (p.requires !== undefined) {
    validatePolicyRequires(p.requires);
  }

  if (p.greenfield !== undefined) {
    validateGreenfieldPolicy(p.greenfield);
  }

  if (!Array.isArray(p.rules)) {
    throw new Error("Policy must have a rules array");
  }

  const seenRuleIds = new Set<string>();
  for (const rule of p.rules) {
    const ruleId = validatePolicyRule(rule);
    if (seenRuleIds.has(ruleId)) {
      throw new Error(`Policy contains duplicate rule id: ${ruleId}`);
    }
    seenRuleIds.add(ruleId);
  }

  return policy as VerifyPolicy;
}

function validateGreenfieldPolicy(greenfield: unknown): void {
  if (!greenfield || typeof greenfield !== "object" || Array.isArray(greenfield)) {
    throw new Error("Policy greenfield must be an object when provided");
  }

  const typed = greenfield as Record<string, unknown>;
  const allowedKeys = new Set(["review_gate"]);
  for (const key of Object.keys(typed)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Policy greenfield has unknown key: ${key}`);
    }
  }

  if (typed.review_gate !== undefined) {
    validateGreenfieldReviewGatePolicy(typed.review_gate);
  }
}

function validateGreenfieldReviewGatePolicy(reviewGate: unknown): void {
  if (!reviewGate || typeof reviewGate !== "object" || Array.isArray(reviewGate)) {
    throw new Error("Policy greenfield.review_gate must be an object when provided");
  }

  const typed = reviewGate as Record<string, unknown>;
  const allowedKeys = new Set([
    "low_confidence_blocks",
    "low_confidence_blocks_by_decision_type",
    "conflict_blocks",
    "blocking_review_item_blocks",
    "blocking_open_decision_types",
    "rejected_blocks",
    "deferred_or_waived_severity",
    "expired_defer_or_waive_severity",
  ]);
  for (const key of Object.keys(typed)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Policy greenfield.review_gate has unknown key: ${key}`);
    }
  }
  for (const key of [
    "low_confidence_blocks",
    "conflict_blocks",
    "blocking_review_item_blocks",
    "rejected_blocks",
  ]) {
    if (typed[key] !== undefined && typeof typed[key] !== "boolean") {
      throw new Error(`Policy greenfield.review_gate.${key} must be a boolean when provided`);
    }
  }
  if (
    typed.deferred_or_waived_severity !== undefined &&
    !["ignore", "advisory", "blocking"].includes(typed.deferred_or_waived_severity as string)
  ) {
    throw new Error("Policy greenfield.review_gate.deferred_or_waived_severity must be ignore, advisory, or blocking");
  }
  if (
    typed.expired_defer_or_waive_severity !== undefined &&
    !["ignore", "advisory", "blocking"].includes(typed.expired_defer_or_waive_severity as string)
  ) {
    throw new Error("Policy greenfield.review_gate.expired_defer_or_waive_severity must be ignore, advisory, or blocking");
  }
  if (
    typed.low_confidence_blocks_by_decision_type !== undefined &&
    (!typed.low_confidence_blocks_by_decision_type ||
      typeof typed.low_confidence_blocks_by_decision_type !== "object" ||
      Array.isArray(typed.low_confidence_blocks_by_decision_type))
  ) {
    throw new Error("Policy greenfield.review_gate.low_confidence_blocks_by_decision_type must be an object when provided");
  }
  if (isRecord(typed.low_confidence_blocks_by_decision_type)) {
    for (const [decisionType, value] of Object.entries(typed.low_confidence_blocks_by_decision_type)) {
      if (!decisionType.trim() || typeof value !== "boolean") {
        throw new Error("Policy greenfield.review_gate.low_confidence_blocks_by_decision_type values must be boolean");
      }
    }
  }
  if (
    typed.blocking_open_decision_types !== undefined &&
    (!Array.isArray(typed.blocking_open_decision_types) ||
      !typed.blocking_open_decision_types.every((entry) => typeof entry === "string" && entry.trim()))
  ) {
    throw new Error("Policy greenfield.review_gate.blocking_open_decision_types must be a string array when provided");
  }
}

function validatePolicyRequires(requires: unknown): void {
  if (!requires || typeof requires !== "object" || Array.isArray(requires)) {
    throw new Error("Policy requires must be an object when provided");
  }

  const typedRequires = requires as Record<string, unknown>;
  const allowedKeys = new Set(["facts_contract"]);

  for (const key of Object.keys(typedRequires)) {
    if (!allowedKeys.has(key)) {
      throw new Error(`Policy requires has unknown key: ${key}`);
    }
  }

  if (
    typedRequires.facts_contract !== undefined &&
    (typeof typedRequires.facts_contract !== "string" || !typedRequires.facts_contract.trim())
  ) {
    throw new Error("Policy requires.facts_contract must be a non-empty string when provided");
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Validate a single policy rule.
 */
function validatePolicyRule(rule: unknown): string {
  if (!rule || typeof rule !== "object") {
    throw new Error("Rule must be an object");
  }

  const r = rule as Record<string, unknown>;

  if (typeof r.id !== "string" || !r.id) {
    throw new Error("Rule must have a non-empty id");
  }

  if (typeof r.enabled !== "boolean") {
    throw new Error(`Rule ${r.id} must have an enabled boolean`);
  }

  if (!["pass", "warn", "fail_blocking"].includes(r.action as string)) {
    throw new Error(`Rule ${r.id} must have a valid action: pass, warn, or fail_blocking`);
  }

  if (typeof r.message !== "string" || !r.message) {
    throw new Error(`Rule ${r.id} must have a non-empty message`);
  }

  if (!r.when) {
    throw new Error(`Rule ${r.id} must have a when condition`);
  }

  validatePolicyCondition(r.when, r.id as string);
  return r.id as string;
}

/**
 * Validate a policy condition.
 */
function validatePolicyCondition(condition: unknown, ruleId: string): void {
  if (!condition || typeof condition !== "object") {
    throw new Error(`Rule ${ruleId} has invalid condition: must be an object`);
  }

  const c = condition as Record<string, unknown>;
  const keys = Object.keys(c);
  const isFactCondition =
    keys.length === 3 &&
    keys.includes("fact") &&
    keys.includes("op") &&
    keys.includes("value");

  if (!isFactCondition && keys.length !== 1) {
    throw new Error(`Rule ${ruleId} condition must be a leaf fact condition or a single operator object`);
  }

  const key = isFactCondition ? "fact" : keys[0];

  if (key === "all" || key === "any") {
    if (!Array.isArray(c[key])) {
      throw new Error(`Rule ${ruleId} condition ${key} must be an array`);
    }
    for (const sub of c[key] as unknown[]) {
      validatePolicyCondition(sub, ruleId);
    }
  } else if (key === "not") {
    validatePolicyCondition(c[key], ruleId);
  } else if (key === "fact") {
    const fact = c as { fact: unknown; op: unknown; value: unknown };
    if (typeof fact.fact !== "string" || !fact.fact) {
      throw new Error(`Rule ${ruleId} fact condition must have a non-empty fact string`);
    }
    if (!["==", "!=", ">", ">=", "<", "<=", "contains", "in"].includes(fact.op as string)) {
      throw new Error(`Rule ${ruleId} fact condition has invalid operator: ${fact.op}`);
    }
  } else {
    throw new Error(`Rule ${ruleId} has unknown condition type: ${key}`);
  }
}

/**
 * Create a default empty verify policy.
 */
export function createDefaultVerifyPolicy(): VerifyPolicy {
  return {
    version: 1,
    rules: [],
  };
}

/**
 * Extract all fact keys referenced in a policy.
 */
export function extractPolicyFactKeys(policy: VerifyPolicy): string[] {
  const keys = new Set<string>();

  for (const rule of policy.rules) {
    extractConditionFactKeys(rule.when, keys);
  }

  return Array.from(keys).sort();
}

/**
 * Extract all fact keys referenced in a single rule.
 */
export function extractPolicyFactKeysForRule(rule: PolicyRule): string[] {
  const keys = new Set<string>();
  extractConditionFactKeys(rule.when, keys);
  return Array.from(keys).sort();
}

/**
 * Validate a policy against the current facts contract.
 */
export function validatePolicyAgainstFactsContract(
  policy: VerifyPolicy,
  contract: FactsContract,
): PolicyFactsContractValidationResult {
  const issues: PolicyValidationIssue[] = [];
  const contractFactKeys = new Set(contract.facts.map((fact) => fact.key));
  const stableFactKeys = new Set(getStableFactKeysFromContract(contract));

  const requiredVersion = policy.requires?.facts_contract;
  if (requiredVersion) {
    const compatibility = checkFactsContractCompatibility(requiredVersion, contract.version);
    if (!compatibility.compatible) {
      issues.push({
        code: "POLICY_FACTS_CONTRACT_MISMATCH",
        message:
          compatibility.reason ??
          `Policy requires facts contract ${requiredVersion} but runtime provides ${contract.version}.`,
      });
    }
  }

  const unknownFactKeys = extractPolicyFactKeys(policy).filter((key) => !contractFactKeys.has(key));
  if (unknownFactKeys.length > 0) {
    issues.push({
      code: "POLICY_UNKNOWN_FACT",
      message: `Policy references unknown facts: ${unknownFactKeys.join(", ")}`,
      factKeys: unknownFactKeys,
    });
  }

  for (const rule of policy.rules) {
    if (rule.action !== "fail_blocking") {
      continue;
    }

    const unstableFactKeys = extractPolicyFactKeysForRule(rule).filter((key) => !stableFactKeys.has(key));
    if (unstableFactKeys.length > 0) {
      issues.push({
        code: "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT",
        message: `Blocking rule '${rule.id}' may only depend on stable facts, but referenced: ${unstableFactKeys.join(", ")}`,
        ruleId: rule.id,
        factKeys: unstableFactKeys,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Extract fact keys from a condition.
 */
function extractConditionFactKeys(condition: PolicyCondition, keys: Set<string>): void {
  if ("all" in condition) {
    for (const sub of condition.all) {
      extractConditionFactKeys(sub, keys);
    }
  } else if ("any" in condition) {
    for (const sub of condition.any) {
      extractConditionFactKeys(sub, keys);
    }
  } else if ("not" in condition) {
    extractConditionFactKeys(condition.not, keys);
  } else if ("fact" in condition) {
    keys.add(condition.fact);
  }
}
