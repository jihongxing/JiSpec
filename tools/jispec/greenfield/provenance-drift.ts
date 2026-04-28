import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

export interface GreenfieldProvenanceAnchorDrift {
  sourceDocument: "requirements" | "technical_solution";
  anchorId: string;
  kind: string;
  path: string;
  expectedLine?: number;
  currentLine?: number;
  paragraphId?: string;
  expectedChecksum?: string;
  currentChecksum?: string;
  excerpt?: string;
  reason: "missing_file" | "line_checksum_mismatch" | "excerpt_not_found";
}

const SOURCE_DOCUMENTS_PATH = ".spec/greenfield/source-documents.yaml";

export function collectGreenfieldProvenanceAnchorDrift(rootInput: string): GreenfieldProvenanceAnchorDrift[] {
  const root = path.resolve(rootInput);
  const manifestPath = path.join(root, SOURCE_DOCUMENTS_PATH);
  if (!fs.existsSync(manifestPath)) {
    return [];
  }

  const manifest = loadYamlRecord(manifestPath);
  const sourceDocuments = isRecord(manifest?.source_documents) ? manifest.source_documents : {};
  return [
    ...collectDocumentDrift(root, "requirements", sourceDocuments.requirements),
    ...collectDocumentDrift(root, "technical_solution", sourceDocuments.technical_solution),
  ].sort((left, right) =>
    `${left.path}|${left.anchorId}|${left.reason}`.localeCompare(`${right.path}|${right.anchorId}|${right.reason}`),
  );
}

export function renderGreenfieldProvenanceDriftWarnings(drifts: GreenfieldProvenanceAnchorDrift[]): string[] {
  return drifts.map((drift) =>
    `Provenance anchor ${drift.anchorId} in ${drift.path} drifted: ${drift.reason}${drift.expectedLine ? ` at line ${drift.expectedLine}` : ""}.`,
  );
}

function collectDocumentDrift(
  root: string,
  sourceDocument: GreenfieldProvenanceAnchorDrift["sourceDocument"],
  documentRecord: unknown,
): GreenfieldProvenanceAnchorDrift[] {
  if (!isRecord(documentRecord)) {
    return [];
  }
  const documentPath = stringValue(documentRecord.path);
  const anchors = arrayRecords(documentRecord.anchors);
  if (!documentPath || anchors.length === 0) {
    return [];
  }

  const resolvedPath = path.join(root, documentPath);
  if (!fs.existsSync(resolvedPath)) {
    return anchors.map((anchor) => ({
      sourceDocument,
      anchorId: stringValue(anchor.id) ?? "unknown-anchor",
      kind: stringValue(anchor.kind) ?? "unknown",
      path: normalizePath(documentPath),
      expectedLine: numberValue(anchor.line),
      paragraphId: stringValue(anchor.paragraph_id),
      expectedChecksum: stringValue(anchor.checksum),
      excerpt: stringValue(anchor.excerpt),
      reason: "missing_file",
    }));
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  const lines = content.split(/\r?\n/);
  const drifts: GreenfieldProvenanceAnchorDrift[] = [];

  for (const anchor of anchors) {
    const drift = evaluateAnchor(root, sourceDocument, normalizePath(documentPath), lines, anchor);
    if (drift) {
      drifts.push(drift);
    }
  }

  return drifts;
}

function evaluateAnchor(
  root: string,
  sourceDocument: GreenfieldProvenanceAnchorDrift["sourceDocument"],
  documentPath: string,
  lines: string[],
  anchor: Record<string, unknown>,
): GreenfieldProvenanceAnchorDrift | undefined {
  const anchorId = stringValue(anchor.id) ?? "unknown-anchor";
  const kind = stringValue(anchor.kind) ?? "unknown";
  const expectedLine = numberValue(anchor.line);
  const paragraphId = stringValue(anchor.paragraph_id);
  const expectedChecksum = stringValue(anchor.checksum);
  const excerpt = stringValue(anchor.excerpt);
  const lineText = expectedLine ? lines[expectedLine - 1]?.trim() ?? "" : "";
  const lineOrBlock = kind === "requirement" && expectedLine
    ? excerptAround(lines, expectedLine - 1)
    : lineText;
  const currentChecksum = lineOrBlock ? checksumText(lineOrBlock) : undefined;

  if (expectedChecksum && currentChecksum && expectedChecksum !== currentChecksum) {
    const foundLine = excerpt ? findExcerptLine(lines, excerpt) : undefined;
    if (foundLine !== undefined && foundLine !== expectedLine) {
      return {
        sourceDocument,
        anchorId,
        kind,
        path: documentPath,
        expectedLine,
        currentLine: foundLine,
        paragraphId,
        expectedChecksum,
        currentChecksum: checksumText(excerptAround(lines, foundLine - 1)),
        excerpt,
        reason: "line_checksum_mismatch",
      };
    }
    return {
      sourceDocument,
      anchorId,
      kind,
      path: documentPath,
      expectedLine,
      paragraphId,
      expectedChecksum,
      currentChecksum,
      excerpt,
      reason: "line_checksum_mismatch",
    };
  }

  if (excerpt && findExcerptLine(lines, excerpt) === undefined) {
    return {
      sourceDocument,
      anchorId,
      kind,
      path: documentPath,
      expectedLine,
      paragraphId,
      expectedChecksum,
      currentChecksum,
      excerpt,
      reason: "excerpt_not_found",
    };
  }

  return undefined;
}

function findExcerptLine(lines: string[], excerpt: string): number | undefined {
  const normalizedExcerpt = normalizeText(excerpt).slice(0, 120);
  if (!normalizedExcerpt) {
    return undefined;
  }
  for (let index = 0; index < lines.length; index++) {
    const block = normalizeText(excerptAround(lines, index));
    if (block.includes(normalizedExcerpt)) {
      return index + 1;
    }
  }
  return undefined;
}

function excerptAround(lines: string[], lineIndex: number): string {
  const excerptLines: string[] = [];
  for (let index = lineIndex; index < lines.length; index++) {
    const line = lines[index]?.trim() ?? "";
    if (index > lineIndex && /^#{1,6}\s+/.test(line)) {
      break;
    }
    if (line) {
      excerptLines.push(line);
    }
    if (excerptLines.join(" ").length >= 220) {
      break;
    }
  }
  return excerptLines.join(" ").slice(0, 280);
}

function loadYamlRecord(filePath: string): Record<string, unknown> | undefined {
  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

function checksumText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizeText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function arrayRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function numberValue(value: unknown): number | undefined {
  return typeof value === "number" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
