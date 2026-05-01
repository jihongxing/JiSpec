import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type SecretFindingType =
  | "private_key_block"
  | "aws_access_key"
  | "openai_api_key"
  | "github_token"
  | "jwt"
  | "connection_string"
  | "credential_assignment";

export interface SecretFinding {
  type: SecretFindingType;
  severity: "medium" | "high";
  line: number;
  column: number;
  matchHash: string;
  redactedPreview: string;
}

export interface RedactionResult {
  text: string;
  findings: SecretFinding[];
}

export interface PrivacyReportOptions {
  root: string;
  outPath?: string;
  generatedAt?: string;
  writeRedactedViews?: boolean;
}

export interface PrivacyReportArtifact {
  path: string;
  category: "discover" | "summary" | "handoff" | "console_export" | "audit" | "release" | "other_jispec_artifact";
  shareDecision: "shareable" | "review_before_sharing";
  findingCount: number;
  findingTypes: SecretFindingType[];
  redactedViewPath?: string;
  findings: SecretFinding[];
}

export interface PrivacyReport {
  schemaVersion: 1;
  kind: "jispec-privacy-report";
  generatedAt: string;
  root: string;
  boundary: {
    localOnly: true;
    sourceUploadRequired: false;
    scansDeclaredJiSpecArtifactsOnly: true;
    changesMachineFacts: false;
    redactedViewsAreShareableCompanions: true;
    replacesVerifyGate: false;
  };
  summary: {
    scannedArtifactCount: number;
    artifactWithFindingCount: number;
    findingCount: number;
    highSeverityFindingCount: number;
    redactedViewCount: number;
    shareableArtifactCount: number;
    reviewBeforeSharingArtifactCount: number;
    findingTypes: Record<string, number>;
  };
  artifactCategories: Record<PrivacyReportArtifact["category"], {
    description: string;
    mayContain: string[];
  }>;
  artifacts: PrivacyReportArtifact[];
}

export interface PrivacyReportResult {
  root: string;
  reportPath: string;
  summaryPath: string;
  report: PrivacyReport;
}

const DEFAULT_REPORT_PATH = ".spec/privacy/privacy-report.json";
const REDACTED_ROOT = ".spec/privacy/redacted";
const MAX_SCANNED_BYTES = 512 * 1024;

const ARTIFACT_CATEGORIES: PrivacyReport["artifactCategories"] = {
  discover: {
    description: "Bootstrap discover, takeover, session, and evidence artifacts.",
    mayContain: ["source paths", "code excerpts", "domain labels", "error messages"],
  },
  summary: {
    description: "Human summaries written by verify, CI, release, Console, and takeover workflows.",
    mayContain: ["paths", "issue summaries", "command output", "reviewer notes"],
  },
  handoff: {
    description: "Implementation and external-tool handoff packets.",
    mayContain: ["diff summaries", "test commands", "tool errors", "next actions"],
  },
  console_export: {
    description: "Console governance snapshots and multi-repo aggregate exports.",
    mayContain: ["repo names", "governance summaries", "waiver reasons", "audit actors"],
  },
  audit: {
    description: "Append-only governance audit ledger.",
    mayContain: ["actors", "reasons", "source artifact references", "affected contract IDs"],
  },
  release: {
    description: "Release baseline, compare, and drift artifacts.",
    mayContain: ["contract IDs", "asset paths", "drift summaries"],
  },
  other_jispec_artifact: {
    description: "Other local JiSpec artifacts under .spec, .jispec, or .jispec-ci.",
    mayContain: ["local paths", "structured metadata", "diagnostic output"],
  },
};

const SECRET_PATTERNS: Array<{
  type: SecretFindingType;
  severity: SecretFinding["severity"];
  pattern: RegExp;
  replacement: string | ((match: string, ...groups: string[]) => string);
}> = [
  {
    type: "private_key_block",
    severity: "high",
    pattern: /-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z0-9 ]*PRIVATE KEY-----/g,
    replacement: "[REDACTED:private_key_block]",
  },
  {
    type: "aws_access_key",
    severity: "high",
    pattern: /\bA(?:KIA|SIA)[A-Z0-9]{16}\b/g,
    replacement: "[REDACTED:aws_access_key]",
  },
  {
    type: "openai_api_key",
    severity: "high",
    pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g,
    replacement: "[REDACTED:openai_api_key]",
  },
  {
    type: "github_token",
    severity: "high",
    pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g,
    replacement: "[REDACTED:github_token]",
  },
  {
    type: "jwt",
    severity: "medium",
    pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/g,
    replacement: "[REDACTED:jwt]",
  },
  {
    type: "connection_string",
    severity: "high",
    pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis|amqp):\/\/[^\s/:@'"`]+:[^\s@'"`]+@[^\s'"`<>)]+/gi,
    replacement: "[REDACTED:connection_string]",
  },
  {
    type: "credential_assignment",
    severity: "high",
    pattern: /\b(api[_-]?key|token|secret|password|passwd|credential|connection[_-]?string|client[_-]?secret|access[_-]?key)\b(\s*[:=]\s*)(["']?)((?!\[REDACTED:)[^\s"',}]+)(["']?)/gi,
    replacement: (_match, key: string, separator: string, openQuote: string, _value: string, closeQuote: string) =>
      `${key}${separator}${openQuote}[REDACTED:credential_assignment]${closeQuote}`,
  },
];

export function redactTextForSharing(input: string): RedactionResult {
  let text = input;
  const findings: SecretFinding[] = [];

  for (const rule of SECRET_PATTERNS) {
    const source = text;
    text = source.replace(rule.pattern, (match: string, ...args: unknown[]) => {
      const offset = Number(args.at(-2) ?? 0);
      const groups = args.slice(0, -2).map(String);
      const position = positionForOffset(source, offset);
      const replacement = typeof rule.replacement === "function"
        ? rule.replacement(match, ...groups)
        : rule.replacement;
      findings.push({
        type: rule.type,
        severity: rule.severity,
        line: position.line,
        column: position.column,
        matchHash: hashSecret(match),
        redactedPreview: previewAround(source, offset, match.length).replace(match, replacement),
      });
      return replacement;
    });
  }

  return { text, findings };
}

export function redactJsonForSharing<T>(value: T): { value: T; findings: SecretFinding[] } {
  const raw = JSON.stringify(value, null, 2);
  const redacted = redactTextForSharing(raw);
  return {
    value: JSON.parse(redacted.text) as T,
    findings: redacted.findings,
  };
}

export function buildPrivacyReport(options: PrivacyReportOptions): PrivacyReportResult {
  const root = path.resolve(options.root);
  const reportPath = resolveReportPath(root, options.outPath);
  const summaryPath = reportPath.replace(/\.json$/i, ".md");
  const candidates = discoverPrivacyScanArtifacts(root);
  const artifacts: PrivacyReportArtifact[] = [];

  for (const relativePath of candidates) {
    const absolutePath = path.join(root, relativePath);
    const stat = fs.statSync(absolutePath);
    if (stat.size > MAX_SCANNED_BYTES) {
      continue;
    }
    const original = fs.readFileSync(absolutePath, "utf-8");
    const redacted = redactTextForSharing(original);
    const category = categorizeArtifact(relativePath);
    const artifact: PrivacyReportArtifact = {
      path: normalizePath(relativePath),
      category,
      shareDecision: redacted.findings.length > 0 ? "review_before_sharing" : "shareable",
      findingCount: redacted.findings.length,
      findingTypes: stableUnique(redacted.findings.map((finding) => finding.type)) as SecretFindingType[],
      findings: redacted.findings,
    };

    if (redacted.findings.length > 0 && options.writeRedactedViews !== false) {
      const redactedRelativePath = path.posix.join(REDACTED_ROOT, `${normalizePath(relativePath)}.redacted`);
      const target = path.join(root, redactedRelativePath);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, redacted.text, "utf-8");
      artifact.redactedViewPath = redactedRelativePath;
    }

    artifacts.push(artifact);
  }

  const report: PrivacyReport = {
    schemaVersion: 1,
    kind: "jispec-privacy-report",
    generatedAt: options.generatedAt ?? new Date().toISOString(),
    root: normalizePath(root),
    boundary: {
      localOnly: true,
      sourceUploadRequired: false,
      scansDeclaredJiSpecArtifactsOnly: true,
      changesMachineFacts: false,
      redactedViewsAreShareableCompanions: true,
      replacesVerifyGate: false,
    },
    summary: buildSummary(artifacts),
    artifactCategories: ARTIFACT_CATEGORIES,
    artifacts,
  };

  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf-8");
  fs.writeFileSync(summaryPath, renderPrivacyReportText(report), "utf-8");

  return {
    root: normalizePath(root),
    reportPath: normalizePath(reportPath),
    summaryPath: normalizePath(summaryPath),
    report,
  };
}

export function renderPrivacyReportJSON(result: PrivacyReportResult): string {
  return JSON.stringify(result, null, 2);
}

export function renderPrivacyReportText(report: PrivacyReport): string {
  const lines = [
    "# JiSpec Privacy Report",
    "",
    `Generated at: ${report.generatedAt}`,
    `Scanned artifacts: ${report.summary.scannedArtifactCount}`,
    `Artifacts needing review: ${report.summary.reviewBeforeSharingArtifactCount}`,
    `Findings: ${report.summary.findingCount}`,
    `High severity findings: ${report.summary.highSeverityFindingCount}`,
    "",
    "## Boundary",
    "",
    "- Local-only report over JiSpec artifacts.",
    "- Does not upload source or artifacts.",
    "- Does not change machine facts.",
    "- Redacted files under `.spec/privacy/redacted/` are shareable companions, not source-of-truth artifacts.",
    "- Does not replace `verify` or `ci:verify`.",
    "",
    "## Findings",
    "",
  ];

  const findings = report.artifacts.filter((artifact) => artifact.findingCount > 0);
  if (findings.length === 0) {
    lines.push("- No common secrets detected in scanned JiSpec artifacts.");
  } else {
    for (const artifact of findings) {
      lines.push(`- ${artifact.path}: ${artifact.findingCount} finding(s), types=${artifact.findingTypes.join(", ")}`);
      if (artifact.redactedViewPath) {
        lines.push(`  Redacted view: ${artifact.redactedViewPath}`);
      }
    }
  }

  lines.push("");
  return lines.join("\n");
}

function buildSummary(artifacts: PrivacyReportArtifact[]): PrivacyReport["summary"] {
  const findingTypes: Record<string, number> = {};
  for (const artifact of artifacts) {
    for (const finding of artifact.findings) {
      findingTypes[finding.type] = (findingTypes[finding.type] ?? 0) + 1;
    }
  }
  return {
    scannedArtifactCount: artifacts.length,
    artifactWithFindingCount: artifacts.filter((artifact) => artifact.findingCount > 0).length,
    findingCount: artifacts.reduce((total, artifact) => total + artifact.findingCount, 0),
    highSeverityFindingCount: artifacts.flatMap((artifact) => artifact.findings).filter((finding) => finding.severity === "high").length,
    redactedViewCount: artifacts.filter((artifact) => artifact.redactedViewPath).length,
    shareableArtifactCount: artifacts.filter((artifact) => artifact.shareDecision === "shareable").length,
    reviewBeforeSharingArtifactCount: artifacts.filter((artifact) => artifact.shareDecision === "review_before_sharing").length,
    findingTypes,
  };
}

function discoverPrivacyScanArtifacts(root: string): string[] {
  const roots = [".spec", ".jispec", ".jispec-ci"];
  return roots
    .flatMap((relativeRoot) => listFiles(root, relativeRoot))
    .filter((relativePath) => !relativePath.startsWith(".spec/privacy/"))
    .filter((relativePath) => /\.(json|jsonl|ya?ml|md|txt|patch|diff|log)$/i.test(relativePath))
    .sort((left, right) => left.localeCompare(right));
}

function listFiles(root: string, relativeDir: string): string[] {
  const absoluteDir = path.join(root, relativeDir);
  if (!fs.existsSync(absoluteDir)) {
    return [];
  }

  const files: string[] = [];
  for (const entry of fs.readdirSync(absoluteDir, { withFileTypes: true })) {
    const relativePath = normalizePath(path.posix.join(relativeDir, entry.name));
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      files.push(...listFiles(root, relativePath));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

function categorizeArtifact(relativePath: string): PrivacyReportArtifact["category"] {
  if (relativePath.startsWith(".spec/sessions/") || relativePath.startsWith(".spec/facts/") || relativePath.includes("takeover")) {
    return "discover";
  }
  if (relativePath.endsWith(".md") || relativePath.includes("summary")) {
    return "summary";
  }
  if (relativePath.startsWith(".jispec/handoff/") || relativePath.startsWith(".jispec/implement/") || relativePath.includes("handoff")) {
    return "handoff";
  }
  if (relativePath.startsWith(".spec/console/")) {
    return "console_export";
  }
  if (relativePath.startsWith(".spec/audit/")) {
    return "audit";
  }
  if (relativePath.startsWith(".spec/releases/") || relativePath.startsWith(".spec/baselines/releases/")) {
    return "release";
  }
  return "other_jispec_artifact";
}

function positionForOffset(text: string, offset: number): { line: number; column: number } {
  const prefix = text.slice(0, offset);
  const lines = prefix.split(/\r?\n/);
  return {
    line: lines.length,
    column: lines.at(-1)?.length ?? 0,
  };
}

function previewAround(text: string, offset: number, length: number): string {
  const start = Math.max(0, offset - 24);
  const end = Math.min(text.length, offset + length + 24);
  return text.slice(start, end).replace(/\r?\n/g, "\\n");
}

function resolveReportPath(root: string, outPath?: string): string {
  const target = outPath ?? DEFAULT_REPORT_PATH;
  return path.isAbsolute(target) ? target : path.join(root, target);
}

function hashSecret(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function stableUnique(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) => left.localeCompare(right));
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
