import fs from "node:fs";
import path from "node:path";
import { normalizeEvidencePath } from "./evidence-graph";
import type { DraftArtifact, DraftArtifactKind } from "./draft";

export interface SpecDebtRecord {
  sessionId: string;
  artifactKind: DraftArtifactKind;
  createdAt: string;
  draftRelativePath: string;
  sourceFiles: string[];
  confidenceScore: number;
  provenanceNote: string;
  draftContent: string;
  note?: string;
}

export function createSpecDebtRecord(
  sessionId: string,
  artifact: DraftArtifact,
  note?: string,
): SpecDebtRecord {
  return {
    sessionId,
    artifactKind: artifact.kind,
    createdAt: new Date().toISOString(),
    draftRelativePath: artifact.relativePath,
    sourceFiles: [...artifact.sourceFiles].sort((left, right) => left.localeCompare(right)),
    confidenceScore: artifact.confidenceScore,
    provenanceNote: artifact.provenanceNote,
    draftContent: artifact.content,
    note,
  };
}

export function writeSpecDebtRecord(baseDirectory: string, record: SpecDebtRecord): string {
  const resolvedBaseDirectory = path.resolve(baseDirectory);
  fs.mkdirSync(resolvedBaseDirectory, { recursive: true });
  const recordPath = path.join(resolvedBaseDirectory, `${record.artifactKind}.json`);
  fs.writeFileSync(recordPath, `${JSON.stringify(record, null, 2)}\n`, "utf-8");
  return normalizeEvidencePath(recordPath);
}
