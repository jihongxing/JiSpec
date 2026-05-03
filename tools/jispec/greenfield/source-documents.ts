import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

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
  sourcePath?: string;
  line: number;
  paragraphId: string;
  excerpt: string;
  checksum: string;
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
        sourcePath,
        line: index + 1,
        paragraphId: id,
        excerpt: line.trim(),
        checksum: checksumText(line.trim()),
      });
    }

    for (const match of line.matchAll(/\bREQ-[A-Z0-9]+-\d{3,}\b/g)) {
      const requirementId = match[0];
      const excerpt = excerptAround(lines, index);
      addAnchor(anchors, seen, {
        id: requirementId,
        kind: "requirement",
        sourcePath,
        line: index + 1,
        paragraphId: `req-${requirementId.toLowerCase()}`,
        excerpt,
        checksum: checksumText(excerpt),
      });
    }
  });

  return anchors.sort((left, right) => left.line - right.line || left.id.localeCompare(right.id));
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

function checksumText(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

function normalizePath(filePath: string): string {
  return filePath.replace(/\\/g, "/");
}
