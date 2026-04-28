import fs from "node:fs";
import path from "node:path";
import { normalizeBoundaryLabel } from "./domain-boundary-policy";
import { getDomainTaxonomyTerms, type DomainTaxonomyPack } from "./domain-taxonomy";
import { normalizeEvidencePath, type EvidenceDocument, type EvidenceGraph } from "./evidence-graph";

export type BusinessVocabularyLanguage = "english" | "chinese" | "mixed";

export interface BusinessVocabularyTerm {
  label: string;
  phrase: string;
  language: BusinessVocabularyLanguage;
  occurrences: number;
  score: number;
  sourcePath: string;
  sourceKind?: EvidenceDocument["kind"];
  reason: string;
  taxonomyPackId?: string;
}

export interface BusinessVocabularyDefinition {
  label: string;
  phrases: string[];
  weight: number;
  taxonomyPackId?: string;
}

const DOCUMENT_KIND_WEIGHT: Record<EvidenceDocument["kind"], number> = {
  readme: 28,
  context: 26,
  architecture: 24,
  contract: 22,
  requirements: 20,
};

export function extractBusinessVocabularyFromDocuments(
  graph: EvidenceGraph,
  documents: EvidenceDocument[],
  options: { limit?: number; taxonomyPacks?: DomainTaxonomyPack[] } = {},
): BusinessVocabularyTerm[] {
  const terms = documents.flatMap((document) => {
    const content = readDocumentText(graph.repoRoot, document.path);
    return content
      ? extractBusinessVocabularyFromText(content, {
          sourcePath: document.path,
          sourceKind: document.kind,
          taxonomyPacks: options.taxonomyPacks,
        })
      : [];
  });

  return rankBusinessVocabularyTerms(terms).slice(0, Math.max(1, Math.trunc(options.limit ?? 24)));
}

export function extractBusinessVocabularyFromText(
  text: string,
  options: { sourcePath: string; sourceKind?: EvidenceDocument["kind"]; taxonomyPacks?: DomainTaxonomyPack[] },
): BusinessVocabularyTerm[] {
  const headingText = extractMarkdownHeadingText(text);
  const terms: BusinessVocabularyTerm[] = [];

  for (const definition of buildBusinessVocabularyDefinitions(options.taxonomyPacks ?? [])) {
    for (const phrase of definition.phrases) {
      const occurrences = countPhraseOccurrences(text, phrase);
      if (occurrences === 0) {
        continue;
      }

      const headingOccurrences = headingText ? countPhraseOccurrences(headingText, phrase) : 0;
      const language = detectVocabularyLanguage(phrase);
      const sourceKindScore = options.sourceKind ? DOCUMENT_KIND_WEIGHT[options.sourceKind] : 18;
      const score = definition.weight + sourceKindScore + occurrences * 12 + headingOccurrences * 10;

      terms.push({
        label: normalizeBoundaryLabel(definition.label),
        phrase,
        language,
        occurrences,
        score: Number(score.toFixed(4)),
        sourcePath: normalizeEvidencePath(options.sourcePath),
        sourceKind: options.sourceKind,
        reason: definition.taxonomyPackId
          ? `${language} ${definition.taxonomyPackId} taxonomy vocabulary '${phrase}' matched ${occurrences} time(s)`
          : `${language} business vocabulary '${phrase}' matched ${occurrences} time(s)`,
        taxonomyPackId: definition.taxonomyPackId,
      });
    }
  }

  return rankBusinessVocabularyTerms(terms);
}

export function summarizeBusinessVocabularyTerms(terms: BusinessVocabularyTerm[], limit = 8): string[] {
  return rankBusinessVocabularyTerms(terms)
    .slice(0, limit)
    .map((term) => `${term.label} via ${term.phrase} (${term.language}, score ${Math.round(term.score)}) from ${term.sourcePath}`);
}

export function getBusinessVocabularyLabels(terms: BusinessVocabularyTerm[], limit = 8): string[] {
  const labels: string[] = [];
  const seen = new Set<string>();
  for (const term of rankBusinessVocabularyTerms(terms)) {
    if (seen.has(term.label)) {
      continue;
    }
    seen.add(term.label);
    labels.push(term.label);
    if (labels.length >= limit) {
      break;
    }
  }
  return labels;
}

function rankBusinessVocabularyTerms(terms: BusinessVocabularyTerm[]): BusinessVocabularyTerm[] {
  const strongestByLabelAndSource = new Map<string, BusinessVocabularyTerm>();

  for (const term of terms) {
    const key = `${term.label}|${term.sourcePath}`;
    const existing = strongestByLabelAndSource.get(key);
    if (!existing || term.score > existing.score || (term.score === existing.score && term.phrase.localeCompare(existing.phrase) < 0)) {
      strongestByLabelAndSource.set(key, term);
    }
  }

  return [...strongestByLabelAndSource.values()].sort((left, right) => {
    const scoreDelta = right.score - left.score;
    if (scoreDelta !== 0) {
      return scoreDelta;
    }
    return `${left.label}|${left.sourcePath}|${left.phrase}`.localeCompare(`${right.label}|${right.sourcePath}|${right.phrase}`);
  });
}

function buildBusinessVocabularyDefinitions(taxonomyPacks: DomainTaxonomyPack[]): BusinessVocabularyDefinition[] {
  return getDomainTaxonomyTerms(taxonomyPacks).map((term) => ({
    label: term.label,
    phrases: term.phrases,
    weight: term.weight,
    taxonomyPackId: term.packId,
  }));
}

function readDocumentText(repoRoot: string, repoPath: string): string | undefined {
  const absolutePath = path.resolve(repoRoot, repoPath);
  try {
    if (!fs.existsSync(absolutePath) || fs.statSync(absolutePath).size > 512 * 1024) {
      return undefined;
    }
    return fs.readFileSync(absolutePath, "utf-8");
  } catch {
    return undefined;
  }
}

function extractMarkdownHeadingText(text: string): string {
  return text
    .split(/\r?\n/g)
    .filter((line) => /^\s{0,3}#{1,6}\s+/.test(line))
    .map((line) => line.replace(/^\s{0,3}#{1,6}\s+/, ""))
    .join("\n");
}

function countPhraseOccurrences(text: string, phrase: string): number {
  if (!text || !phrase) {
    return 0;
  }

  const escapedPhrase = escapeRegExp(phrase).replace(/\s+/g, "\\s+");
  const hasCjk = /[\u3400-\u9fff]/u.test(phrase);
  const flags = "giu";
  const pattern = hasCjk
    ? new RegExp(escapedPhrase, flags)
    : new RegExp(`(?:^|[^a-z0-9])${escapedPhrase}(?=$|[^a-z0-9])`, flags);

  let count = 0;
  for (const _match of text.matchAll(pattern)) {
    count += 1;
  }
  return count;
}

function detectVocabularyLanguage(value: string): BusinessVocabularyLanguage {
  const hasChinese = /[\u3400-\u9fff]/u.test(value);
  const hasEnglish = /[a-z]/iu.test(value);
  if (hasChinese && hasEnglish) {
    return "mixed";
  }
  return hasChinese ? "chinese" : "english";
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
