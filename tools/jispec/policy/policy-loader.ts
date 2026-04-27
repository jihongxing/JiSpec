import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { validateVerifyPolicy, type VerifyPolicy } from "./policy-schema";

export const DEFAULT_POLICY_PATH = ".spec/policy.yaml";

/**
 * Load verify policy from a file.
 * Returns null if file doesn't exist.
 */
export function loadVerifyPolicy(root: string, filePath?: string): VerifyPolicy | null {
  const policyPath = resolvePolicyPath(root, filePath);

  if (!fs.existsSync(policyPath)) {
    return null;
  }

  try {
    return validateVerifyPolicy(readPolicyDocument(policyPath));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to load policy from ${policyPath}: ${message}`);
  }
}

/**
 * Read and parse a raw policy document from disk.
 */
export function readPolicyDocument(policyPath: string): unknown {
  const content = fs.readFileSync(policyPath, "utf-8");
  return yaml.load(content);
}

/**
 * Resolve the policy file path.
 */
export function resolvePolicyPath(root: string, filePath?: string): string {
  if (filePath) {
    return path.isAbsolute(filePath) ? filePath : path.join(root, filePath);
  }
  return path.join(root, DEFAULT_POLICY_PATH);
}

/**
 * Check if a policy file exists.
 */
export function policyFileExists(root: string, filePath?: string): boolean {
  const policyPath = resolvePolicyPath(root, filePath);
  return fs.existsSync(policyPath);
}

/**
 * Write a verify policy to a file.
 */
export function writeVerifyPolicy(root: string, policy: VerifyPolicy, filePath?: string): string {
  const policyPath = resolvePolicyPath(root, filePath);
  const policyDir = path.dirname(policyPath);

  if (!fs.existsSync(policyDir)) {
    fs.mkdirSync(policyDir, { recursive: true });
  }

  const content = yaml.dump(policy, {
    indent: 2,
    lineWidth: 100,
    noRefs: true,
  });

  fs.writeFileSync(policyPath, content, "utf-8");
  return policyPath;
}
