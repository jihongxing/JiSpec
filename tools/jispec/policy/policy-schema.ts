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
  team?: TeamPolicyProfile;
  waivers?: WaiverPolicy;
  release?: ReleasePolicy;
  execute_default?: ExecuteDefaultPolicy;
  greenfield?: {
    review_gate?: GreenfieldReviewGatePolicy;
  };
  rules: PolicyRule[];
}

export type TeamPolicyProfileName = "solo" | "small_team" | "regulated";

export interface TeamPolicyProfile {
  profile?: TeamPolicyProfileName;
  owner?: string;
  reviewers?: string[];
  required_reviewers?: number;
}

export interface WaiverPolicy {
  require_owner?: boolean;
  require_reason?: boolean;
  require_expiration?: boolean;
  max_active_days?: number;
  expiring_soon_days?: number;
  unmatched_active_severity?: "ignore" | "advisory" | "blocking";
}

export interface ReleasePolicy {
  require_snapshot?: boolean;
  require_compare?: boolean;
  drift_requires_owner_review?: boolean;
  policy_drift_severity?: "ignore" | "advisory" | "blocking";
  static_collector_drift_severity?: "ignore" | "advisory" | "blocking";
  contract_graph_drift_severity?: "ignore" | "advisory" | "blocking";
}

export interface ExecuteDefaultPolicy {
  allowed?: boolean;
  require_policy?: boolean;
  require_clear_adopt_boundary?: boolean;
  require_clean_verify?: boolean;
  max_cost_usd?: number;
  max_iterations?: number;
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
    | "POLICY_BLOCKING_RULE_USES_UNSTABLE_FACT"
    | "POLICY_UNKNOWN_KEY"
    | "POLICY_DEPRECATED_KEY";
  message: string;
  ruleId?: string;
  factKeys?: string[];
  key?: string;
  replacement?: string;
}

export interface PolicyFactsContractValidationResult {
  valid: boolean;
  issues: PolicyValidationIssue[];
}

export class PolicySchemaError extends Error {
  code: "POLICY_UNKNOWN_KEY" | "POLICY_DEPRECATED_KEY";
  key?: string;
  replacement?: string;

  constructor(
    code: "POLICY_UNKNOWN_KEY" | "POLICY_DEPRECATED_KEY",
    message: string,
    details: { key?: string; replacement?: string } = {},
  ) {
    super(message);
    this.name = "PolicySchemaError";
    this.code = code;
    this.key = details.key;
    this.replacement = details.replacement;
  }
}

export function isPolicySchemaError(error: unknown): error is PolicySchemaError {
  return error instanceof PolicySchemaError;
}

/**
 * Validate a verify policy structure.
 */
export function validateVerifyPolicy(policy: unknown): VerifyPolicy {
  if (!policy || typeof policy !== "object") {
    throw new Error("Policy must be an object");
  }

  const p = policy as Record<string, unknown>;
  const allowedTopLevelKeys = new Set(["version", "requires", "team", "waivers", "release", "execute_default", "greenfield", "rules"]);
  const deprecatedTopLevelKeys = new Map([
    ["facts_contract", "requires.facts_contract"],
    ["team_profile", "team.profile"],
    ["waiver_policy", "waivers"],
    ["release_policy", "release"],
    ["executeDefault", "execute_default"],
  ]);

  for (const key of Object.keys(p)) {
    const replacement = deprecatedTopLevelKeys.get(key);
    if (replacement) {
      throw new PolicySchemaError(
        "POLICY_DEPRECATED_KEY",
        `Policy key '${key}' is deprecated; use '${replacement}' instead.`,
        { key, replacement },
      );
    }
    if (!allowedTopLevelKeys.has(key)) {
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy has unknown key: ${key}`, { key });
    }
  }

  if (p.version !== 1) {
    throw new Error("Policy version must be 1");
  }

  if (p.requires !== undefined) {
    validatePolicyRequires(p.requires);
  }

  if (p.team !== undefined) {
    validateTeamPolicyProfile(p.team);
  }

  if (p.waivers !== undefined) {
    validateWaiverPolicy(p.waivers);
  }

  if (p.release !== undefined) {
    validateReleasePolicy(p.release);
  }

  if (p.execute_default !== undefined) {
    validateExecuteDefaultPolicy(p.execute_default);
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
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy greenfield has unknown key: ${key}`, {
        key: `greenfield.${key}`,
      });
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
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy greenfield.review_gate has unknown key: ${key}`, {
        key: `greenfield.review_gate.${key}`,
      });
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

function validateTeamPolicyProfile(team: unknown): void {
  if (!team || typeof team !== "object" || Array.isArray(team)) {
    throw new Error("Policy team must be an object when provided");
  }

  const typed = team as Record<string, unknown>;
  const allowedKeys = new Set(["profile", "owner", "reviewers", "required_reviewers"]);
  for (const key of Object.keys(typed)) {
    if (!allowedKeys.has(key)) {
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy team has unknown key: ${key}`, {
        key: `team.${key}`,
      });
    }
  }

  if (typed.profile !== undefined && !["solo", "small_team", "regulated"].includes(typed.profile as string)) {
    throw new Error("Policy team.profile must be solo, small_team, or regulated when provided");
  }
  if (typed.owner !== undefined && (typeof typed.owner !== "string" || !typed.owner.trim())) {
    throw new Error("Policy team.owner must be a non-empty string when provided");
  }
  if (
    typed.reviewers !== undefined &&
    (!Array.isArray(typed.reviewers) ||
      !typed.reviewers.every((entry) => typeof entry === "string" && entry.trim()))
  ) {
    throw new Error("Policy team.reviewers must be a string array when provided");
  }
  if (
    typed.required_reviewers !== undefined &&
    (!Number.isInteger(typed.required_reviewers) || (typed.required_reviewers as number) < 0)
  ) {
    throw new Error("Policy team.required_reviewers must be a non-negative integer when provided");
  }
}

function validateWaiverPolicy(waivers: unknown): void {
  validateObjectKeys("waivers", waivers, new Set([
    "require_owner",
    "require_reason",
    "require_expiration",
    "max_active_days",
    "expiring_soon_days",
    "unmatched_active_severity",
  ]));
  const typed = waivers as Record<string, unknown>;
  validateOptionalBoolean(typed, "waivers", "require_owner");
  validateOptionalBoolean(typed, "waivers", "require_reason");
  validateOptionalBoolean(typed, "waivers", "require_expiration");
  validateOptionalPositiveInteger(typed, "waivers", "max_active_days");
  validateOptionalPositiveInteger(typed, "waivers", "expiring_soon_days");
  validateOptionalSeverity(typed, "waivers", "unmatched_active_severity");
}

function validateReleasePolicy(release: unknown): void {
  validateObjectKeys("release", release, new Set([
    "require_snapshot",
    "require_compare",
    "drift_requires_owner_review",
    "policy_drift_severity",
    "static_collector_drift_severity",
    "contract_graph_drift_severity",
  ]));
  const typed = release as Record<string, unknown>;
  validateOptionalBoolean(typed, "release", "require_snapshot");
  validateOptionalBoolean(typed, "release", "require_compare");
  validateOptionalBoolean(typed, "release", "drift_requires_owner_review");
  validateOptionalSeverity(typed, "release", "policy_drift_severity");
  validateOptionalSeverity(typed, "release", "static_collector_drift_severity");
  validateOptionalSeverity(typed, "release", "contract_graph_drift_severity");
}

function validateExecuteDefaultPolicy(executeDefault: unknown): void {
  validateObjectKeys("execute_default", executeDefault, new Set([
    "allowed",
    "require_policy",
    "require_clear_adopt_boundary",
    "require_clean_verify",
    "max_cost_usd",
    "max_iterations",
  ]));
  const typed = executeDefault as Record<string, unknown>;
  validateOptionalBoolean(typed, "execute_default", "allowed");
  validateOptionalBoolean(typed, "execute_default", "require_policy");
  validateOptionalBoolean(typed, "execute_default", "require_clear_adopt_boundary");
  validateOptionalBoolean(typed, "execute_default", "require_clean_verify");
  validateOptionalPositiveNumber(typed, "execute_default", "max_cost_usd");
  validateOptionalPositiveInteger(typed, "execute_default", "max_iterations");
}

function validateObjectKeys(label: string, value: unknown, allowedKeys: Set<string>): void {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Policy ${label} must be an object when provided`);
  }

  const typed = value as Record<string, unknown>;
  for (const key of Object.keys(typed)) {
    if (!allowedKeys.has(key)) {
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy ${label} has unknown key: ${key}`, {
        key: `${label}.${key}`,
      });
    }
  }
}

function validateOptionalBoolean(record: Record<string, unknown>, label: string, key: string): void {
  if (record[key] !== undefined && typeof record[key] !== "boolean") {
    throw new Error(`Policy ${label}.${key} must be a boolean when provided`);
  }
}

function validateOptionalPositiveInteger(record: Record<string, unknown>, label: string, key: string): void {
  if (record[key] !== undefined && (!Number.isInteger(record[key]) || (record[key] as number) <= 0)) {
    throw new Error(`Policy ${label}.${key} must be a positive integer when provided`);
  }
}

function validateOptionalPositiveNumber(record: Record<string, unknown>, label: string, key: string): void {
  if (record[key] !== undefined && (typeof record[key] !== "number" || !Number.isFinite(record[key]) || record[key] <= 0)) {
    throw new Error(`Policy ${label}.${key} must be a positive number when provided`);
  }
}

function validateOptionalSeverity(record: Record<string, unknown>, label: string, key: string): void {
  if (record[key] !== undefined && !["ignore", "advisory", "blocking"].includes(record[key] as string)) {
    throw new Error(`Policy ${label}.${key} must be ignore, advisory, or blocking`);
  }
}

function validatePolicyRequires(requires: unknown): void {
  if (!requires || typeof requires !== "object" || Array.isArray(requires)) {
    throw new Error("Policy requires must be an object when provided");
  }

  const typedRequires = requires as Record<string, unknown>;
  const allowedKeys = new Set(["facts_contract"]);
  const deprecatedKeys = new Map([["factsContract", "facts_contract"]]);

  for (const key of Object.keys(typedRequires)) {
    const replacement = deprecatedKeys.get(key);
    if (replacement) {
      throw new PolicySchemaError(
        "POLICY_DEPRECATED_KEY",
        `Policy requires.${key} is deprecated; use requires.${replacement} instead.`,
        { key: `requires.${key}`, replacement: `requires.${replacement}` },
      );
    }
    if (!allowedKeys.has(key)) {
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Policy requires has unknown key: ${key}`, {
        key: `requires.${key}`,
      });
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
  const allowedKeys = new Set(["id", "enabled", "action", "message", "when"]);
  for (const key of Object.keys(r)) {
    if (!allowedKeys.has(key)) {
      throw new PolicySchemaError("POLICY_UNKNOWN_KEY", `Rule has unknown key: ${key}`, {
        key: typeof r.id === "string" ? `rules.${r.id}.${key}` : `rules.${key}`,
      });
    }
  }

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
