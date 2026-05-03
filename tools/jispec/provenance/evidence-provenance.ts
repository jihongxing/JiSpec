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
  provenanceLabel?: unknown;
  ownerReviewPosture?: unknown;
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

const LABEL_ALIASES: Record<string, EvidenceProvenanceLabel> = {
  extracted: "EXTRACTED",
  extract: "EXTRACTED",
  inferred: "INFERRED",
  infer: "INFERRED",
  ambiguous: "AMBIGUOUS",
  weak: "AMBIGUOUS",
  uncertain: "AMBIGUOUS",
  owner_review: "OWNER_REVIEW",
  ownerreview: "OWNER_REVIEW",
  review_required: "OWNER_REVIEW",
  review: "OWNER_REVIEW",
  unknown: "UNKNOWN",
};

const OWNER_REVIEW_POSTURE_ALIASES: Record<string, EvidenceOwnerReviewPosture> = {
  not_required: "not_required",
  notrequired: "not_required",
  optional: "not_required",
  recommended: "recommended",
  suggested: "recommended",
  review: "recommended",
  required: "required",
  mandatory: "required",
  blocking: "required",
};

export function normalizeEvidenceProvenanceLabel(value: unknown): EvidenceProvenanceLabel {
  const token = normalizeLooseToken(value);
  if (!token) {
    return "UNKNOWN";
  }

  const alias = LABEL_ALIASES[token];
  if (alias) {
    return alias;
  }

  const canonical = token.toUpperCase().replace(/[^A-Z_]/g, "_").replace(/_+/g, "_") as EvidenceProvenanceLabel;
  return KNOWN_LABELS.has(canonical) ? canonical : "UNKNOWN";
}

export function normalizeEvidenceOwnerReviewPosture(value: unknown): EvidenceOwnerReviewPosture {
  const token = normalizeLooseToken(value);
  if (!token) {
    return "required";
  }

  return OWNER_REVIEW_POSTURE_ALIASES[token] ?? "required";
}

export function inferEvidenceProvenance(input: EvidenceProvenanceInput): {
  label: EvidenceProvenanceLabel;
  descriptor: EvidenceProvenanceDescriptor;
} {
  const normalizedPath = input.sourcePath ? normalizeEvidencePath(input.sourcePath) : "";
  const confidence = normalizeConfidence(input.confidence);
  const ambiguous = input.ambiguous === true;
  const explicitLabel = normalizeEvidenceProvenanceLabel(input.provenanceLabel);
  const ownerReviewPosture = input.ownerReviewPosture !== undefined
    ? normalizeEvidenceOwnerReviewPosture(input.ownerReviewPosture)
    : inferOwnerReviewPosture(confidence, input.ownerReviewRequired === true, ambiguous);
  const label = explicitLabel !== "UNKNOWN"
    ? explicitLabel
    : inferLabel(confidence, ownerReviewPosture, ambiguous, normalizedPath);

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

function normalizeLooseToken(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const token = value
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, "_")
    .replace(/__+/g, "_");

  return token.length > 0 ? token : undefined;
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
