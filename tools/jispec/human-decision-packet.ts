import {
  DECISION_SNAPSHOT_FIELD_LABELS,
  splitDecisionCompanionSections,
  type DecisionCompanionSectionsInput,
} from "./companion/decision-sections";

export interface HumanDecisionSnapshot {
  currentState: string;
  risk: string;
  evidence: string[];
  owner: string;
  nextCommand: string;
  affectedArtifact?: string;
  expiration?: string;
  replayCommand?: string;
}

interface HumanDecisionSnapshotField {
  label: string;
  value: string;
}

export const HUMAN_SUMMARY_COMPANION_NOTE =
  "This Markdown file is a human-readable companion summary, not a machine API.";

export function renderHumanDecisionSnapshot(snapshot: HumanDecisionSnapshot): string[] {
  return [
    "## Decision Snapshot",
    "",
    ...renderHumanDecisionSnapshotFields(snapshot).map((line) => `- ${line}`),
    "",
  ];
}

export function renderHumanDecisionSnapshotText(snapshot: HumanDecisionSnapshot): string[] {
  return renderHumanDecisionSnapshotFields(snapshot);
}

export function renderHumanReviewerDecisionCompanion(input: DecisionCompanionSectionsInput): string[] {
  return splitDecisionCompanionSections(input);
}

function renderHumanDecisionSnapshotFields(snapshot: HumanDecisionSnapshot): string[] {
  return buildHumanDecisionSnapshotFields(snapshot).map(({ label, value }) => `${label}: ${value}`);
}

function buildHumanDecisionSnapshotFields(snapshot: HumanDecisionSnapshot): HumanDecisionSnapshotField[] {
  const fields: HumanDecisionSnapshotField[] = [
    { label: DECISION_SNAPSHOT_FIELD_LABELS.currentState, value: snapshot.currentState },
    { label: DECISION_SNAPSHOT_FIELD_LABELS.risk, value: snapshot.risk },
    { label: DECISION_SNAPSHOT_FIELD_LABELS.evidence, value: snapshot.evidence.length > 0 ? snapshot.evidence.join(", ") : "not recorded" },
    { label: DECISION_SNAPSHOT_FIELD_LABELS.owner, value: snapshot.owner },
    { label: DECISION_SNAPSHOT_FIELD_LABELS.nextCommand, value: snapshot.nextCommand },
  ];

  if (snapshot.affectedArtifact?.trim()) {
    fields.push({ label: DECISION_SNAPSHOT_FIELD_LABELS.affectedArtifact, value: snapshot.affectedArtifact.trim() });
  }
  if (snapshot.expiration?.trim()) {
    fields.push({ label: DECISION_SNAPSHOT_FIELD_LABELS.expiration, value: snapshot.expiration.trim() });
  }
  if (snapshot.replayCommand?.trim()) {
    fields.push({ label: DECISION_SNAPSHOT_FIELD_LABELS.replayCommand, value: snapshot.replayCommand.trim() });
  }

  return fields;
}
