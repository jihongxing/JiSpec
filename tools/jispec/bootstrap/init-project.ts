import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";
import { normalizeEvidencePath } from "./evidence-graph";

const PROJECT_RELATIVE_PATH = "jiproject/project.yaml";

export interface BootstrapInitProjectOptions {
  root: string;
  force?: boolean;
}

export interface BootstrapInitProjectResult {
  root: string;
  projectPath: string;
  projectRelativePath: string;
  created: boolean;
  overwritten: boolean;
  writtenFiles: string[];
}

interface PackageJson {
  name?: unknown;
  version?: unknown;
  description?: unknown;
}

export function getBootstrapProjectRelativePath(): string {
  return PROJECT_RELATIVE_PATH;
}

export function getBootstrapProjectPath(rootInput: string): string {
  return path.join(path.resolve(rootInput), PROJECT_RELATIVE_PATH);
}

export function bootstrapProjectExists(rootInput: string): boolean {
  return fs.existsSync(getBootstrapProjectPath(rootInput));
}

export function runBootstrapInitProject(options: BootstrapInitProjectOptions): BootstrapInitProjectResult {
  const root = path.resolve(options.root);
  if (!fs.existsSync(root)) {
    throw new Error(`Repository root does not exist: ${root}`);
  }

  const projectPath = getBootstrapProjectPath(root);
  const projectRelativePath = getBootstrapProjectRelativePath();
  const exists = fs.existsSync(projectPath);
  if (exists && options.force !== true) {
    return {
      root: normalizeEvidencePath(root),
      projectPath: normalizeEvidencePath(projectPath),
      projectRelativePath,
      created: false,
      overwritten: false,
      writtenFiles: [],
    };
  }

  fs.mkdirSync(path.dirname(projectPath), { recursive: true });
  fs.writeFileSync(projectPath, renderMinimalProjectYaml(root), "utf-8");

  return {
    root: normalizeEvidencePath(root),
    projectPath: normalizeEvidencePath(projectPath),
    projectRelativePath,
    created: !exists,
    overwritten: exists,
    writtenFiles: [normalizeEvidencePath(projectPath)],
  };
}

export function renderBootstrapInitProjectText(result: BootstrapInitProjectResult): string {
  const lines = [
    result.overwritten
      ? `Bootstrap project scaffold overwritten at \`${result.projectRelativePath}\`.`
      : result.created
        ? `Bootstrap project scaffold created at \`${result.projectRelativePath}\`.`
        : `Bootstrap project scaffold already exists at \`${result.projectRelativePath}\`.`,
  ];

  if (result.writtenFiles.length > 0) {
    lines.push("Written files:");
    lines.push(...result.writtenFiles.map((filePath) => `- ${filePath}`));
  } else {
    lines.push("Written files: none");
    lines.push("Use `--force` to overwrite the existing project scaffold.");
  }

  return lines.join("\n");
}

function renderMinimalProjectYaml(root: string): string {
  const packageJson = loadPackageJson(root);
  const identity = inferProjectIdentity(root, packageJson);
  const sourceDocuments = inferSourceDocuments(root);
  const project = {
    id: identity.id,
    name: identity.name,
    version: identity.version,
    delivery_model: "bootstrap-takeover",
    domain_taxonomy: {
      packs: [] as string[],
    },
    source_documents: sourceDocuments,
    global_gates: [
      "contracts_validated",
      "review_passed",
    ],
  };

  return yaml.dump(project, {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

function loadPackageJson(root: string): PackageJson | undefined {
  const packagePath = path.join(root, "package.json");
  if (!fs.existsSync(packagePath)) {
    return undefined;
  }

  try {
    return JSON.parse(fs.readFileSync(packagePath, "utf-8")) as PackageJson;
  } catch {
    return undefined;
  }
}

function inferProjectIdentity(root: string, packageJson: PackageJson | undefined): {
  id: string;
  name: string;
  version: string;
} {
  const packageName = typeof packageJson?.name === "string" ? packageJson.name : undefined;
  const rawId = packageName ?? path.basename(root);
  const id = slugifyProjectId(rawId) || "bootstrap-project";
  const rawName = packageName ? packageName.replace(/^@[^/]+\//, "") : path.basename(root);
  const name = titleCase(rawName) || "Bootstrap Project";
  const version = typeof packageJson?.version === "string" && packageJson.version.trim().length > 0
    ? packageJson.version.trim()
    : "0.1.0";

  return { id, name, version };
}

function inferSourceDocuments(root: string): { requirements: string; technical_solution: string } {
  const requirements = firstExistingPath(root, [
    "docs/input/requirements.md",
    "docs/requirements.md",
    "requirements.md",
    "README.md",
    PROJECT_RELATIVE_PATH,
  ]);
  const technicalSolution = firstExistingPath(root, [
    "docs/input/technical-solution.md",
    "docs/technical-solution.md",
    "docs/architecture.md",
    "docs/design.md",
    "README.md",
    requirements,
    PROJECT_RELATIVE_PATH,
  ]);

  return {
    requirements,
    technical_solution: technicalSolution,
  };
}

function firstExistingPath(root: string, candidates: string[]): string {
  for (const candidate of candidates) {
    if (fs.existsSync(path.join(root, candidate))) {
      return normalizeEvidencePath(candidate);
    }
  }

  return PROJECT_RELATIVE_PATH;
}

function slugifyProjectId(value: string): string {
  return value
    .replace(/^@/, "")
    .replace(/\//g, "-")
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function titleCase(value: string): string {
  return value
    .replace(/^@[^/]+\//, "")
    .replace(/[-_.]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}
