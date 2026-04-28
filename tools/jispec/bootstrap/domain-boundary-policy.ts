import path from "node:path";

const TECHNICAL_BOUNDARY_LABELS = new Set([
  "api",
  "api-server",
  "app",
  "backend",
  "bootstrap",
  "build",
  "cmd",
  "database",
  "db",
  "dist",
  "frontend",
  "generated",
  "go",
  "golang",
  "grpc",
  "migration",
  "migrations",
  "node",
  "nodejs",
  "proto",
  "protobuf",
  "sdk",
  "server",
  "src",
  "web",
]);

const DOMAIN_NOISE_LABELS = new Set([
  "add",
  "client",
  "clients",
  "config",
  "configuration",
  "context",
  "contexts",
  "controller",
  "controllers",
  "create",
  "delete",
  "design",
  "doc",
  "docs",
  "get",
  "handler",
  "handlers",
  "helper",
  "helpers",
  "index",
  "init",
  "insert",
  "interface",
  "interfaces",
  "jiproject",
  "lib",
  "list",
  "main",
  "manifest",
  "manifests",
  "model",
  "models",
  "new",
  "package",
  "project",
  "readme",
  "remove",
  "report",
  "route",
  "router",
  "routes",
  "schema",
  "schemas",
  "service",
  "services",
  "set",
  "spec",
  "specs",
  "test",
  "tests",
  "trait",
  "traits",
  "update",
  "upsert",
  "util",
  "utils",
]);

export function normalizeBoundaryLabel(value: string): string {
  const cleaned = value
    .toLowerCase()
    .replace(/\.[^.]+$/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  if (!cleaned) {
    return "";
  }

  if (cleaned.endsWith("ies") && cleaned.length > 4) {
    return `${cleaned.slice(0, -3)}y`;
  }

  if (cleaned.endsWith("s") && cleaned.length > 4 && !cleaned.endsWith("ss")) {
    return cleaned.slice(0, -1);
  }

  return cleaned;
}

export function isTechnicalBoundaryLabel(value: string): boolean {
  const label = normalizeBoundaryLabel(value);
  return label.length > 0 && TECHNICAL_BOUNDARY_LABELS.has(label);
}

export function isBoundaryNoiseLabel(value: string): boolean {
  const label = normalizeBoundaryLabel(value);
  return label.length === 0 || TECHNICAL_BOUNDARY_LABELS.has(label) || DOMAIN_NOISE_LABELS.has(label) || isDateOrNumberLabel(label);
}

export function hasTechnicalBoundaryToken(value: string): boolean {
  const label = normalizeBoundaryLabel(value);
  if (!label) {
    return false;
  }

  return isTechnicalBoundaryLabel(label) || label.split("-").some((token) => TECHNICAL_BOUNDARY_LABELS.has(token));
}

export function selectBusinessBoundaryLabel(value: string): string | undefined {
  const label = normalizeBoundaryLabel(value);
  if (!label) {
    return undefined;
  }

  const tokens = label.split("-");
  const hasNoiseToken = tokens.some((token) => isBoundaryNoiseLabel(token));

  if (!isBoundaryNoiseLabel(label) && !hasTechnicalBoundaryToken(label) && !hasNoiseToken) {
    return label;
  }

  const businessTokens = tokens.filter((token) => !isBoundaryNoiseLabel(token));
  if (businessTokens.length === 0) {
    return undefined;
  }

  return businessTokens.join("-");
}

export function selectBusinessBoundaryFromPath(repoPath: string): string | undefined {
  const normalizedPath = repoPath.replace(/\\/g, "/");
  const segments = normalizedPath.split("/").filter(Boolean);
  const basename = path.posix.basename(normalizedPath);
  const basenameWithoutExtension = basename
    .replace(/\.[^.]+$/g, "")
    .replace(/\.(schema|test|spec)$/g, "")
    .replace(/(?:^|[-_.])(route|routes|router|controller|controllers|service|services|handler|handlers|model|models|api|index|main|server)$/g, "");

  const basenameLabel = selectBusinessBoundaryLabel(basenameWithoutExtension);
  if (basenameLabel) {
    return basenameLabel;
  }

  for (let index = segments.length - 2; index >= 0; index -= 1) {
    const label = selectBusinessBoundaryLabel(segments[index]);
    if (label) {
      return label;
    }
  }

  return undefined;
}

export function isBrandLevelBoundaryLabel(value: string, brandHints: string[]): boolean {
  const label = normalizeBoundaryLabel(value);
  if (!label || label.length < 4) {
    return false;
  }

  return brandHints.some((hint) => {
    const normalizedHint = normalizeBoundaryLabel(hint);
    return (
      normalizedHint.length >= 4 &&
      (label === normalizedHint || normalizedHint.endsWith(label) || normalizedHint.startsWith(label))
    );
  });
}

export function shouldSuppressPrimaryBoundaryLabel(
  value: string,
  options: { brandHints?: string[]; hasSpecificAlternative?: boolean } = {},
): boolean {
  const label = normalizeBoundaryLabel(value);
  if (!label) {
    return true;
  }

  if (isBoundaryNoiseLabel(label) || hasTechnicalBoundaryToken(label)) {
    return true;
  }

  if (options.hasSpecificAlternative && isBrandLevelBoundaryLabel(label, options.brandHints ?? [])) {
    return true;
  }

  return false;
}

export function hasBusinessBoundarySignal(value: string): boolean {
  return Boolean(selectBusinessBoundaryLabel(value));
}

function isDateOrNumberLabel(label: string): boolean {
  return /^\d+$/.test(label) || /^\d{4,8}(?:-\d+)*$/.test(label);
}
