import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import * as yaml from "js-yaml";

export type GreenfieldInputMode = "strict" | "requirements-only" | "idea-only";
export type GreenfieldInputContractStatus = "passed" | "failed" | "warning";
export type GreenfieldRequirementsStatus = "strong" | "usable" | "weak" | "missing";
export type GreenfieldTechnicalSolutionStatus = "strong" | "usable" | "missing";

export interface GreenfieldInputContractGuidance {
  supportedModes: GreenfieldInputMode[];
  requirements: {
    required: true;
    description: string;
  };
  technicalSolution: {
    optional: true;
    description: string;
  };
  jiSpecResponsibilities: string[];
  userResponsibilities: string[];
}

export interface GreenfieldSourceDocumentOptions {
  requirements?: string;
  technicalSolution?: string;
}

export type GreenfieldSourceSnapshotStatus = "active" | "proposed";

export interface GreenfieldSourceSnapshotOpenQuestionsSummary {
  path: string;
  generated_at?: string;
  total: number;
  blocking: number;
  source_documents: number;
  contracts: number;
  behavior: number;
  slices: number;
}

export interface GreenfieldSourceSnapshotOptions {
  root?: string;
  requirementsPath?: string;
  technicalSolutionPath?: string;
  snapshotStatus: GreenfieldSourceSnapshotStatus;
  generatedAt?: string;
  snapshotId?: string;
  openQuestions?: GreenfieldSourceSnapshotOpenQuestionsSummary;
}

export interface GreenfieldSourceSnapshotComparison {
  changed: boolean;
  documentChecksumChanged: Array<"requirements" | "technical_solution">;
  addedRequirementIds: string[];
  removedRequirementIds: string[];
  changedRequirementIds: string[];
}

export interface GreenfieldResolvedSourceManifest {
  manifestPath: string;
  compatibilityMode: "active" | "legacy";
  manifest: Record<string, unknown>;
}

export const GREENFIELD_ACTIVE_SOURCE_MANIFEST_PATH = ".spec/greenfield/source-documents.active.yaml";
export const GREENFIELD_COMPAT_SOURCE_MANIFEST_PATH = ".spec/greenfield/source-documents.yaml";

export interface GreenfieldLoadedSourceDocument {
  path?: string;
  role: "product_requirements" | "technical_solution";
  status: GreenfieldRequirementsStatus | GreenfieldTechnicalSolutionStatus;
  exists: boolean;
  checksum?: string;
  lineCount: number;
  requirementIds?: string[];
  anchors?: GreenfieldSourceAnchor[];
}

export interface GreenfieldSourceAnchor {
  id: string;
  kind: "requirement" | "heading";
  contractLevel: "required" | "supporting";
  sourcePath?: string;
  line: number;
  paragraphId: string;
  excerpt: string;
  checksum: string;
  aliases?: string[];
}

export interface GreenfieldInputContract {
  contractVersion: 1;
  guidance: GreenfieldInputContractGuidance;
  status: GreenfieldInputContractStatus;
  mode: GreenfieldInputMode;
  requirements: GreenfieldLoadedSourceDocument;
  technicalSolution: GreenfieldLoadedSourceDocument;
  blockingIssues: string[];
  warnings: string[];
  openDecisions: string[];
}

interface DocumentReadResult {
  requestedPath?: string;
  resolvedPath?: string;
  exists: boolean;
  content: string;
}

export function loadGreenfieldSourceDocuments(options: GreenfieldSourceDocumentOptions): GreenfieldInputContract {
  const requirements = readDocument(options.requirements);
  const technicalSolution = readDocument(options.technicalSolution);
  const mode = determineInputMode(options);
  const blockingIssues: string[] = [];
  const warnings: string[] = [];
  const openDecisions: string[] = [];

  const requirementsStatus = classifyRequirements(requirements, blockingIssues, warnings, openDecisions);
  const technicalSolutionStatus = classifyTechnicalSolution(
    technicalSolution,
    mode,
    blockingIssues,
    warnings,
    openDecisions,
  );

  if (mode === "idea-only") {
    blockingIssues.push("input_contract_failed: product requirements document is required for Greenfield initialization.");
    openDecisions.push("Create a PRD from the product idea before running Greenfield initialization.");
  }

  const inputStatus: GreenfieldInputContractStatus =
    blockingIssues.length > 0 ? "failed" : warnings.length > 0 || openDecisions.length > 0 ? "warning" : "passed";

  return {
    contractVersion: 1,
    guidance: {
      supportedModes: ["strict", "requirements-only"],
      requirements: {
        required: true,
        description: "Users must provide a product requirements document before Greenfield initialization can proceed.",
      },
      technicalSolution: {
        optional: true,
        description: "Users may provide a technical solution; JiSpec can still infer drafts when only requirements are available.",
      },
      jiSpecResponsibilities: [
        "Normalize source documents into stable checksums and anchors.",
        "Draft domain, API, and behavior contracts from the available source documents.",
        "Surface warnings, blocking issues, and open decisions without hiding uncertainty.",
      ],
      userResponsibilities: [
        "Provide a requirements document for every initialization.",
        "Provide a technical solution when the intended architecture or boundaries are already known.",
      ],
    },
    status: inputStatus,
    mode,
    requirements: buildLoadedDocument("product_requirements", requirements, requirementsStatus, extractRequirementIds(requirements.content)),
    technicalSolution: buildLoadedDocument("technical_solution", technicalSolution, technicalSolutionStatus),
    blockingIssues,
    warnings,
    openDecisions,
  };
}

export function buildGreenfieldSourceDocumentsManifest(
  inputContract: GreenfieldInputContract,
  options: GreenfieldSourceSnapshotOptions,
): Record<string, unknown> {
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const requirementsPath = resolveManifestDocumentPath(
    options.root,
    options.requirementsPath ?? inputContract.requirements.path,
    "docs/input/requirements.md",
  );
  const technicalSolutionPath = resolveManifestDocumentPath(
    options.root,
    options.technicalSolutionPath ?? inputContract.technicalSolution.path,
    "docs/input/technical-solution.md",
  );
  const snapshotId = options.snapshotId ?? createGreenfieldSourceSnapshotId(inputContract, generatedAt);

  return {
    snapshot: {
      version: 1,
      id: snapshotId,
      status: options.snapshotStatus,
      generated_at: generatedAt,
    },
    input_contract: {
      version: inputContract.contractVersion,
      supported_modes: inputContract.guidance.supportedModes,
      requirements: inputContract.guidance.requirements,
      technical_solution: inputContract.guidance.technicalSolution,
      ji_spec_responsibilities: inputContract.guidance.jiSpecResponsibilities,
      user_responsibilities: inputContract.guidance.userResponsibilities,
    },
    source_documents: {
      requirements: buildManifestDocumentRecord(inputContract.requirements, requirementsPath),
      technical_solution: buildManifestDocumentRecord(inputContract.technicalSolution, technicalSolutionPath),
    },
    input_mode: inputContract.mode,
    input_status: inputContract.status,
    blocking_issues: inputContract.blockingIssues,
    warnings: inputContract.warnings,
    open_decisions: inputContract.openDecisions,
    ...(options.openQuestions ? {
      open_questions: {
        ...options.openQuestions,
        generated_at: options.openQuestions.generated_at ?? generatedAt,
      },
    } : {}),
    generated_at: generatedAt,
  };
}

export function renderGreenfieldSourceDocumentsManifest(
  inputContract: GreenfieldInputContract,
  options: GreenfieldSourceSnapshotOptions,
): string {
  return yaml.dump(buildGreenfieldSourceDocumentsManifest(inputContract, options), {
    lineWidth: 100,
    noRefs: true,
    sortKeys: false,
  });
}

export function compareGreenfieldSourceManifests(
  activeManifest: Record<string, unknown>,
  proposedManifest: Record<string, unknown>,
): GreenfieldSourceSnapshotComparison {
  const activeDocuments = getManifestSourceDocuments(activeManifest);
  const proposedDocuments = getManifestSourceDocuments(proposedManifest);
  const documentChecksumChanged: Array<"requirements" | "technical_solution"> = [];

  for (const role of ["requirements", "technical_solution"] as const) {
    const activeChecksum = stringValue(activeDocuments[role]?.checksum);
    const proposedChecksum = stringValue(proposedDocuments[role]?.checksum);
    if (activeChecksum !== proposedChecksum) {
      documentChecksumChanged.push(role);
    }
  }

  const activeRequirementIds = stringArrayValue(activeDocuments.requirements?.requirement_ids);
  const proposedRequirementIds = stringArrayValue(proposedDocuments.requirements?.requirement_ids);
  const activeAnchors = anchorsById(activeDocuments.requirements?.anchors);
  const proposedAnchors = anchorsById(proposedDocuments.requirements?.anchors);
  const addedRequirementIds = proposedRequirementIds.filter((id) => !activeRequirementIds.includes(id));
  const removedRequirementIds = activeRequirementIds.filter((id) => !proposedRequirementIds.includes(id));
  const changedRequirementIds = proposedRequirementIds.filter((id) =>
    activeRequirementIds.includes(id) &&
    stringValue(activeAnchors[id]?.checksum) !== stringValue(proposedAnchors[id]?.checksum),
  );

  return {
    changed:
      documentChecksumChanged.length > 0 ||
      addedRequirementIds.length > 0 ||
      removedRequirementIds.length > 0 ||
      changedRequirementIds.length > 0,
    documentChecksumChanged,
    addedRequirementIds: addedRequirementIds.sort(),
    removedRequirementIds: removedRequirementIds.sort(),
    changedRequirementIds: changedRequirementIds.sort(),
  };
}

export function loadGreenfieldSourceManifest(filePath: string): Record<string, unknown> | undefined {
  if (!fs.existsSync(filePath)) {
    return undefined;
  }

  try {
    const parsed = yaml.load(fs.readFileSync(filePath, "utf-8"));
    return isRecord(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

export function resolveGreenfieldActiveSourceManifestPath(rootInput: string): string {
  const root = path.resolve(rootInput);
  const activePath = path.join(root, GREENFIELD_ACTIVE_SOURCE_MANIFEST_PATH);
  if (fs.existsSync(activePath)) {
    return activePath;
  }
  return path.join(root, GREENFIELD_COMPAT_SOURCE_MANIFEST_PATH);
}

export function loadResolvedGreenfieldSourceManifest(rootInput: string): GreenfieldResolvedSourceManifest | undefined {
  const root = path.resolve(rootInput);
  const activePath = path.join(root, GREENFIELD_ACTIVE_SOURCE_MANIFEST_PATH);
  const compatPath = path.join(root, GREENFIELD_COMPAT_SOURCE_MANIFEST_PATH);
  const activeManifest = loadGreenfieldSourceManifest(activePath);
  if (activeManifest) {
    return {
      manifestPath: normalizePath(activePath),
      compatibilityMode: "active",
      manifest: activeManifest,
    };
  }

  const compatManifest = loadGreenfieldSourceManifest(compatPath);
  if (!compatManifest) {
    return undefined;
  }

  return {
    manifestPath: normalizePath(compatPath),
    compatibilityMode: "legacy",
    manifest: compatManifest,
  };
}

function determineInputMode(options: GreenfieldSourceDocumentOptions): GreenfieldInputMode {
  if (!options.requirements) {
    return "idea-only";
  }

  if (!options.technicalSolution) {
    return "requirements-only";
  }

  return "strict";
}

function readDocument(filePath: string | undefined): DocumentReadResult {
  if (!filePath) {
    return {
      exists: false,
      content: "",
    };
  }

  const resolvedPath = path.resolve(filePath);
  if (!fs.existsSync(resolvedPath)) {
    return {
      requestedPath: normalizePath(filePath),
      resolvedPath: normalizePath(resolvedPath),
      exists: false,
      content: "",
    };
  }

  const content = fs.readFileSync(resolvedPath, "utf-8");
  return {
    requestedPath: normalizePath(filePath),
    resolvedPath: normalizePath(resolvedPath),
    exists: true,
    content,
  };
}

function classifyRequirements(
  document: DocumentReadResult,
  blockingIssues: string[],
  warnings: string[],
  openDecisions: string[],
): GreenfieldRequirementsStatus {
  if (!document.resolvedPath || !document.exists) {
    blockingIssues.push("input_contract_failed: requirements file is missing.");
    return "missing";
  }

  const content = document.content.trim();
  if (content.length === 0) {
    blockingIssues.push("input_contract_failed: requirements file is empty.");
    return "weak";
  }

  const hasObjective = /\b(objective|goal|purpose|目标|目的)\b/i.test(content);
  const requirementIds = extractRequirementIds(content);
  const hasFunctionalRequirementHeading = /(functional requirements|core requirements|功能需求|核心需求)/i.test(content);

  if (!hasObjective) {
    blockingIssues.push("input_contract_failed: requirements file does not contain a product objective.");
  }

  if (requirementIds.length === 0 && !hasFunctionalRequirementHeading) {
    blockingIssues.push("input_contract_failed: requirements file does not contain recognizable functional requirements.");
  }

  if (blockingIssues.length > 0) {
    return "weak";
  }

  const hasJourney = /(journey|workflow|flow|用户旅程|核心旅程|流程)/i.test(content);
  const hasNonFunctional = /(non-functional|quality|performance|security|非功能|性能|安全)/i.test(content);
  const hasOutOfScope = /(out of scope|non-goal|不包含|非目标|暂不)/i.test(content);
  const hasAcceptance = /(acceptance|success signal|验收|成功信号)/i.test(content);

  if (!hasJourney) {
    warnings.push("requirements_warning: core user journeys are missing or too implicit.");
    openDecisions.push("Clarify core user journeys before relying on generated behavior scenarios.");
  }

  if (!hasNonFunctional) {
    warnings.push("requirements_warning: non-functional requirements are missing.");
  }

  if (!hasOutOfScope) {
    warnings.push("requirements_warning: out-of-scope items are missing.");
  }

  if (!hasAcceptance) {
    warnings.push("requirements_warning: acceptance signals are missing.");
  }

  if (requirementIds.length === 0) {
    warnings.push("requirements_warning: stable requirement IDs are missing.");
    openDecisions.push("Assign stable REQ-<DOMAIN>-<NNN> IDs before release baseline.");
    return "usable";
  }

  return hasJourney && hasNonFunctional && hasOutOfScope && hasAcceptance ? "strong" : "usable";
}

function classifyTechnicalSolution(
  document: DocumentReadResult,
  mode: GreenfieldInputMode,
  blockingIssues: string[],
  warnings: string[],
  openDecisions: string[],
): GreenfieldTechnicalSolutionStatus {
  if (!document.resolvedPath || !document.exists) {
    if (mode === "strict") {
      blockingIssues.push("input_contract_failed: technical solution file is missing.");
    } else {
      warnings.push("technical_solution_warning: technical solution is missing; initialization will use requirements-only mode.");
      openDecisions.push("Provide a technical solution to reduce inferred architecture, API, and context decisions.");
    }
    return "missing";
  }

  const content = document.content.trim();
  if (isTechnicalSolutionPlaceholder(content)) {
    if (mode === "strict") {
      blockingIssues.push("input_contract_failed: technical solution placeholder must be replaced with a real technical solution.");
    } else {
      warnings.push("technical_solution_warning: technical solution is still the generated placeholder; initialization will remain requirements-only.");
      openDecisions.push("Replace docs/input/technical-solution.md placeholder with a real technical solution before tightening source governance.");
    }
    return "missing";
  }
  if (content.length === 0) {
    warnings.push("technical_solution_warning: technical solution file is empty.");
    openDecisions.push("Fill in architecture direction, boundaries, and testing strategy.");
    return "usable";
  }

  const hasArchitecture = /(architecture|架构)/i.test(content);
  const hasBoundaries = /(bounded context|boundary|integration|ownership|边界|集成|所有权)/i.test(content);
  const hasTesting = /(testing|test strategy|测试)/i.test(content);
  const hasConstraintsOrRisks = /(constraint|risk|open decision|约束|风险|开放决策)/i.test(content);

  if (!hasArchitecture) {
    warnings.push("technical_solution_warning: architecture direction is missing.");
  }

  if (!hasBoundaries) {
    warnings.push("technical_solution_warning: boundaries or ownership rules are missing.");
    openDecisions.push("Clarify bounded contexts, integration boundaries, or ownership rules.");
  }

  if (!hasTesting) {
    warnings.push("technical_solution_warning: testing strategy is missing.");
  }

  return hasArchitecture && hasBoundaries && hasTesting && hasConstraintsOrRisks ? "strong" : "usable";
}

function buildLoadedDocument(
  role: GreenfieldLoadedSourceDocument["role"],
  document: DocumentReadResult,
  status: GreenfieldLoadedSourceDocument["status"],
  requirementIds?: string[],
): GreenfieldLoadedSourceDocument {
  const content = document.content;
  return {
    path: document.resolvedPath,
    role,
    status,
    exists: document.exists,
    checksum: document.exists ? crypto.createHash("sha256").update(content).digest("hex") : undefined,
    lineCount: content.length === 0 ? 0 : content.split(/\r?\n/).length,
    requirementIds,
    anchors: document.exists ? extractSourceAnchors(content, document.resolvedPath) : [],
  };
}

function buildManifestDocumentRecord(
  document: GreenfieldLoadedSourceDocument,
  manifestPath: string,
): Record<string, unknown> {
  return {
    path: manifestPath,
    original_path: document.path,
    role: document.role,
    status: document.status,
    checksum: document.checksum,
    line_count: document.lineCount,
    ...(document.requirementIds ? { requirement_ids: document.requirementIds } : {}),
    anchors: document.anchors?.map((anchor) => ({
      id: anchor.id,
      kind: anchor.kind,
      contract_level: anchor.contractLevel,
      path: manifestPath,
      line: anchor.line,
      paragraph_id: anchor.paragraphId,
      excerpt: anchor.excerpt,
      checksum: anchor.checksum,
      aliases: anchor.aliases ?? [],
    })) ?? [],
  };
}

export function extractRequirementIds(content: string): string[] {
  return Array.from(new Set(content.match(/\bREQ-[A-Z0-9]+-\d{3,}\b/g) ?? [])).sort();
}

export function extractSourceAnchors(content: string, sourcePath?: string): GreenfieldSourceAnchor[] {
  const lines = content.split(/\r?\n/);
  const anchors: GreenfieldSourceAnchor[] = [];
  const seen = new Set<string>();

  lines.forEach((line, index) => {
    const heading = line.match(/^#{1,6}\s+(.+?)\s*$/);
    if (heading?.[1]) {
      const id = slugifyParagraphId(heading[1]);
      addAnchor(anchors, seen, {
        id,
        kind: "heading",
        contractLevel: determineAnchorContractLevel(id, "heading"),
        sourcePath,
        line: index + 1,
        paragraphId: id,
        excerpt: line.trim(),
        checksum: checksumText(line.trim()),
        aliases: buildAnchorAliases(id, "heading", line.trim()),
      });
    }

    for (const match of line.matchAll(/\bREQ-[A-Z0-9]+-\d{3,}\b/g)) {
      const requirementId = match[0];
      const excerpt = excerptAround(lines, index);
      addAnchor(anchors, seen, {
        id: requirementId,
        kind: "requirement",
        contractLevel: determineAnchorContractLevel(requirementId, "requirement"),
        sourcePath,
        line: index + 1,
        paragraphId: `req-${requirementId.toLowerCase()}`,
        excerpt,
        checksum: checksumText(excerpt),
        aliases: buildAnchorAliases(requirementId, "requirement", excerpt),
      });
    }
  });

  return anchors.sort((left, right) => left.line - right.line || left.id.localeCompare(right.id));
}

function determineAnchorContractLevel(
  id: string,
  kind: GreenfieldSourceAnchor["kind"],
): GreenfieldSourceAnchor["contractLevel"] {
  // Heading layout is too easy to change in real business documents, so only
  // stable requirement paragraphs remain blocking provenance anchors.
  if (kind === "requirement") {
    return "required";
  }
  return "supporting";
}

function addAnchor(
  anchors: GreenfieldSourceAnchor[],
  seen: Set<string>,
  anchor: GreenfieldSourceAnchor,
): void {
  const key = `${anchor.kind}:${anchor.id}:${anchor.line}`;
  if (seen.has(key)) {
    return;
  }
  seen.add(key);
  anchors.push({
    ...anchor,
    sourcePath: anchor.sourcePath ? normalizePath(anchor.sourcePath) : undefined,
  });
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

function slugifyParagraphId(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-+|-+$/g, "") || "heading";
}

function buildAnchorAliases(id: string, kind: GreenfieldSourceAnchor["kind"], excerpt: string): string[] {
  const normalizedExcerpt = normalizeAliasText(excerpt);
  const aliases = new Set<string>([
    normalizeAliasText(id),
    normalizeAliasText(id.replace(/-/g, " ")),
  ]);

  for (const alias of aliasSynonyms(id, kind)) {
    aliases.add(normalizeAliasText(alias));
  }

  if (kind === "heading") {
    aliases.add(normalizedExcerpt.replace(/^#+\s*/, ""));
  }

  return Array.from(aliases).filter((alias) => alias.length > 0);
}

function aliasSynonyms(id: string, kind: GreenfieldSourceAnchor["kind"]): string[] {
  const table: Record<string, string[]> = {
    objective: ["goal", "purpose"],
    "users-actors": ["users / actors", "users actors", "users", "actors"],
    "core-journeys": ["core journeys", "journeys", "workflow", "flow"],
    "functional-requirements": ["functional requirements", "core requirements"],
    "non-functional-requirements": ["non-functional requirements", "non functional requirements", "nfr"],
    "out-of-scope": ["out of scope", "non-goals", "non goals", "non-goal"],
    "acceptance-signals": ["acceptance signals", "success signals", "acceptance"],
    "architecture-direction": ["architecture direction", "bounded context hypothesis"],
    "bounded-context-hypothesis": ["bounded context hypothesis", "architecture direction"],
    "integration-boundaries": ["integration boundaries", "integration rule"],
    "data-ownership": ["data ownership", "ownership"],
    "testing-strategy": ["testing strategy", "test strategy"],
    "operational-constraints": ["operational constraints", "constraints"],
    "risks-and-open-decisions": ["risks and open decisions", "open decisions", "risks"],
  };

  const aliases = table[id] ?? [];
  if (kind === "requirement") {
    return aliases;
  }
  return aliases;
}

function normalizeAliasText(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function checksumText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function createGreenfieldSourceSnapshotId(inputContract: GreenfieldInputContract, generatedAt: string): string {
  const hashInput = [
    generatedAt,
    inputContract.mode,
    inputContract.requirements.checksum ?? "missing",
    inputContract.technicalSolution.checksum ?? "missing",
  ].join("|");
  const compactDate = generatedAt.replace(/[-:]/g, "").replace(/\..+$/, "").replace("T", "-");
  return `source-${compactDate}-${checksumText(hashInput).slice(0, 8)}`;
}

function resolveManifestDocumentPath(root: string | undefined, candidate: string | undefined, fallback: string): string {
  if (!candidate) {
    return fallback;
  }
  if (!root) {
    return normalizePath(candidate);
  }

  const resolvedRoot = path.resolve(root);
  const resolvedCandidate = path.resolve(candidate);
  const relativePath = path.relative(resolvedRoot, resolvedCandidate);
  if (!relativePath.startsWith("..") && !path.isAbsolute(relativePath)) {
    return normalizePath(relativePath);
  }
  return normalizePath(resolvedCandidate);
}

function getManifestSourceDocuments(
  manifest: Record<string, unknown>,
): Record<"requirements" | "technical_solution", Record<string, unknown> | undefined> {
  const sourceDocuments = isRecord(manifest.source_documents) ? manifest.source_documents : {};
  return {
    requirements: isRecord(sourceDocuments.requirements) ? sourceDocuments.requirements : undefined,
    technical_solution: isRecord(sourceDocuments.technical_solution) ? sourceDocuments.technical_solution : undefined,
  };
}

function anchorsById(value: unknown): Record<string, Record<string, unknown>> {
  if (!Array.isArray(value)) {
    return {};
  }

  const result: Record<string, Record<string, unknown>> = {};
  for (const anchor of value) {
    if (!isRecord(anchor)) {
      continue;
    }
    const id = stringValue(anchor.id);
    if (!id) {
      continue;
    }
    result[id] = anchor;
  }
  return result;
}

function stringArrayValue(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isTechnicalSolutionPlaceholder(content: string): boolean {
  return /^#\s+Technical Solution Placeholder\b/m.test(content);
}

export function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
