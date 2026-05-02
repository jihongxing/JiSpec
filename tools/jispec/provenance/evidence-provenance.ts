import { normalizeEvidencePath } from "../bootstrap/evidence-graph";

export type EvidenceProvenanceLabel =
  | "EXTRACTED"
  | "INFERRED"
  | "AMBIGUOUS"
  | "OWNER_REVIEW"
  | "UNKNOWN";

export type EvidenceOwnerReviewPosture =
  | "not_required"
  | "recommended"
  | "required";

export interface EvidenceProvenanceInput {
  confidence?: number;
  evidenceKind: string;
  sourcePath: string;
  ownerReviewRequired?: boolean;
  ambiguous?: boolean;
}

export interface EvidenceProvenanceDescriptor {
  provenanceLabel: EvidenceProvenanceLabel;
  evidenceKind: string;
  sourcePath: string;
  confidence: number | null;
  ownerReviewPosture: EvidenceOwnerReviewPosture;
}

const KNOWN_LABELS = new Set<EvidenceProvenanceLabel>([
  "EXTRACTED",
  "INFERRED",
  "AMBIGUOUS",
  "OWNER_REVIEW",
  "UNKNOWN",
]);

export function normalizeEvidenceProvenanceLabel(value: unknown): EvidenceProvenanceLabel {
  return typeof value === "string" && KNOWN_LABELS.has(value as EvidenceProvenanceLabel)
    ? value as EvidenceProvenanceLabel
    : "UNKNOWN";
}

export function inferEvidenceProvenance(input: EvidenceProvenanceInput): {
  label: EvidenceProvenanceLabel;
  descriptor: EvidenceProvenanceDescriptor;
} {
  const normalizedPath = input.sourcePath ? normalizeEvidencePath(input.sourcePath) : "";
  const confidence = normalizeConfidence(input.confidence);
  const ambiguous = input.ambiguous === true;
  const ownerReviewPosture = inferOwnerReviewPosture(confidence, input.ownerReviewRequired === true, ambiguous);
  const label = inferLabel(confidence, ownerReviewPosture, ambiguous, normalizedPath);

  return {
    label,
    descriptor: {
      provenanceLabel: label,
      evidenceKind: input.evidenceKind || "unknown",
      sourcePath: normalizedPath,
      confidence,
      ownerReviewPosture,
    },
  };
}

export function inferEvidenceProvenanceDescriptor(input: EvidenceProvenanceInput): EvidenceProvenanceDescriptor {
  return inferEvidenceProvenance(input).descriptor;
}

function normalizeConfidence(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }
  return Number(Math.max(0, Math.min(1, value)).toFixed(4));
}

function inferOwnerReviewPosture(
  confidence: number | null,
  ownerReviewRequired: boolean,
  ambiguous: boolean,
): EvidenceOwnerReviewPosture {
  if (ownerReviewRequired || ambiguous || confidence === null || confidence < 0.5) {
    return "required";
  }
  if (confidence < 0.9) {
    return "recommended";
  }
  return "not_required";
}

function inferLabel(
  confidence: number | null,
  ownerReviewPosture: EvidenceOwnerReviewPosture,
  ambiguous: boolean,
  sourcePath: string,
): EvidenceProvenanceLabel {
  if (!sourcePath || confidence === null) {
    return "UNKNOWN";
  }
  if (ownerReviewPosture === "required" && !ambiguous && confidence >= 0.8) {
    return "OWNER_REVIEW";
  }
  if (ambiguous || confidence < 0.5) {
    return "AMBIGUOUS";
  }
  if (confidence >= 0.9) {
    return "EXTRACTED";
  }
  return "INFERRED";
}
