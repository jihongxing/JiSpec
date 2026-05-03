import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";

export type RepoGroupStatus = "available" | "not_available_yet" | "invalid";
export type RepoGroupRole = "upstream" | "downstream" | "peer";

export interface RepoGroupRepo {
  id: string;
  role: RepoGroupRole;
  path: string;
  upstreamContractRefs: string[];
  downstreamContractRefs: string[];
}

export interface RepoGroupConfig {
  status: RepoGroupStatus;
  sourcePath: string;
  repos: RepoGroupRepo[];
  warnings: string[];
}

export const REPO_GROUP_RELATIVE_PATH = ".spec/console/repo-group.yaml";

export function loadRepoGroupConfig(rootInput: string): RepoGroupConfig {
  const root = path.resolve(rootInput);
  const absolutePath = path.join(root, REPO_GROUP_RELATIVE_PATH);
  if (!fs.existsSync(absolutePath)) {
    return {
      status: "not_available_yet",
      sourcePath: REPO_GROUP_RELATIVE_PATH,
      repos: [],
      warnings: [],
    };
  }

  try {
    const parsed = yaml.load(fs.readFileSync(absolutePath, "utf-8"));
    return {
      status: "available",
      sourcePath: REPO_GROUP_RELATIVE_PATH,
      repos: parseRepos(parsed),
      warnings: [],
    };
  } catch (error) {
    return {
      status: "invalid",
      sourcePath: REPO_GROUP_RELATIVE_PATH,
      repos: [],
      warnings: [error instanceof Error ? error.message : String(error)],
    };
  }
}

function parseRepos(value: unknown): RepoGroupRepo[] {
  if (!isRecord(value) || !Array.isArray(value.repos)) {
    throw new Error("repo-group.yaml must contain a repos array");
  }

  return value.repos.map((repo, index) => parseRepo(repo, index));
}

function parseRepo(value: unknown, index: number): RepoGroupRepo {
  if (!isRecord(value)) {
    throw new Error(`repos[${index}] must be an object`);
  }

  const role = requiredString(value.role, `repos[${index}].role`);
  if (role !== "upstream" && role !== "downstream" && role !== "peer") {
    throw new Error(`repos[${index}].role must be upstream, downstream, or peer`);
  }

  return {
    id: requiredString(value.id, `repos[${index}].id`),
    role,
    path: requiredString(value.path, `repos[${index}].path`),
    upstreamContractRefs: stringArray(value.upstreamContractRefs),
    downstreamContractRefs: stringArray(value.downstreamContractRefs),
  };
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${label} is required`);
  }
  return normalizePath(value.trim());
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => normalizePath(entry.trim()))
      .filter((entry) => entry.length > 0)
    : [];
}

function normalizePath(value: string): string {
  return value.replace(/\\/g, "/");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
