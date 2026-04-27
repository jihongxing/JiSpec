import type { CanonicalFactsSnapshot } from "../facts/canonical-facts";
import { getCanonicalFactValue } from "../facts/canonical-facts";
import type { VerifyIssue } from "../verify/verdict";
import type { PolicyAction, PolicyCondition, PolicyRule, VerifyPolicy } from "./policy-schema";

export interface PolicyRuleResult {
  ruleId: string;
  action: PolicyAction;
  matched: boolean;
  message: string;
}

export interface PolicyEvaluationResult {
  matchedRules: PolicyRuleResult[];
  generatedIssues: VerifyIssue[];
  warnings: string[];
}

/**
 * Evaluate a verify policy against canonical facts.
 */
export function evaluateVerifyPolicy(
  policy: VerifyPolicy,
  facts: CanonicalFactsSnapshot,
): PolicyEvaluationResult {
  const matchedRules: PolicyRuleResult[] = [];
  const generatedIssues: VerifyIssue[] = [];
  const warnings: string[] = [];

  for (const rule of policy.rules) {
    if (!rule.enabled) {
      continue;
    }

    try {
      const matched = evaluatePolicyCondition(rule.when, facts);

      const result: PolicyRuleResult = {
        ruleId: rule.id,
        action: rule.action,
        matched,
        message: rule.message,
      };

      if (matched) {
        matchedRules.push(result);

        const issue = policyRuleResultToVerifyIssue(result);
        if (issue) {
          generatedIssues.push(issue);
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      warnings.push(`Rule ${rule.id} evaluation failed: ${message}`);
    }
  }

  return {
    matchedRules,
    generatedIssues,
    warnings,
  };
}

/**
 * Evaluate a policy condition against facts.
 */
export function evaluatePolicyCondition(
  condition: PolicyCondition,
  facts: CanonicalFactsSnapshot,
): boolean {
  if ("all" in condition) {
    return condition.all.every((sub) => evaluatePolicyCondition(sub, facts));
  }

  if ("any" in condition) {
    return condition.any.some((sub) => evaluatePolicyCondition(sub, facts));
  }

  if ("not" in condition) {
    return !evaluatePolicyCondition(condition.not, facts);
  }

  if ("fact" in condition) {
    const factValue = resolveFactValue(facts, condition.fact);
    return evaluateComparison(factValue, condition.op, condition.value);
  }

  throw new Error(`Unknown condition type: ${JSON.stringify(condition)}`);
}

/**
 * Resolve a fact value from the snapshot.
 */
export function resolveFactValue(facts: CanonicalFactsSnapshot, factKey: string): unknown {
  return getCanonicalFactValue(facts, factKey);
}

/**
 * Evaluate a comparison operation.
 */
function evaluateComparison(
  left: unknown,
  op: "==" | "!=" | ">" | ">=" | "<" | "<=" | "contains" | "in",
  right: unknown,
): boolean {
  switch (op) {
    case "==":
      return left === right;
    case "!=":
      return left !== right;
    case ">":
      return typeof left === "number" && typeof right === "number" && left > right;
    case ">=":
      return typeof left === "number" && typeof right === "number" && left >= right;
    case "<":
      return typeof left === "number" && typeof right === "number" && left < right;
    case "<=":
      return typeof left === "number" && typeof right === "number" && left <= right;
    case "contains":
      if (typeof left === "string" && typeof right === "string") {
        return left.includes(right);
      }
      if (Array.isArray(left)) {
        return left.includes(right);
      }
      return false;
    case "in":
      if (Array.isArray(right)) {
        return right.includes(left);
      }
      return false;
    default:
      throw new Error(`Unknown operator: ${op}`);
  }
}

/**
 * Convert a policy rule result to a verify issue.
 */
export function policyRuleResultToVerifyIssue(result: PolicyRuleResult): VerifyIssue | null {
  if (result.action === "pass") {
    return null;
  }

  const severity = result.action === "fail_blocking" ? "blocking" : "advisory";

  return {
    kind: "semantic",
    severity,
    code: `POLICY_${result.ruleId.toUpperCase().replace(/[^A-Z0-9]/g, "_")}`,
    message: result.message,
    details: {
      ruleId: result.ruleId,
      action: result.action,
    },
  };
}
