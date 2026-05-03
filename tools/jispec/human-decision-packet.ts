import {
  splitDecisionCompanionSections,
  type DecisionCompanionSectionsInput,
} from "./companion/decision-sections";

export interface HumanDecisionSnapshot {
  currentState: string;
  risk: string;
  evidence: string[];
  owner: string;
  nextCommand: string;
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
  return [
    { label: "Current state", value: snapshot.currentState },
    { label: "Risk", value: snapshot.risk },
    { label: "Evidence", value: snapshot.evidence.length > 0 ? snapshot.evidence.join(", ") : "not recorded" },
    { label: "Owner", value: snapshot.owner },
    { label: "Next command", value: snapshot.nextCommand },
  ];
}
