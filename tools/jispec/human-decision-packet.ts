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

export const HUMAN_SUMMARY_COMPANION_NOTE =
  "This Markdown file is a human-readable companion summary, not a machine API.";

export function renderHumanDecisionSnapshot(snapshot: HumanDecisionSnapshot): string[] {
  return [
    "## Decision Snapshot",
    "",
    `- Current state: ${snapshot.currentState}`,
    `- Risk: ${snapshot.risk}`,
    `- Evidence: ${snapshot.evidence.length > 0 ? snapshot.evidence.join(", ") : "not recorded"}`,
    `- Owner: ${snapshot.owner}`,
    `- Next command: ${snapshot.nextCommand}`,
    "",
  ];
}

export function renderHumanDecisionSnapshotText(snapshot: HumanDecisionSnapshot): string[] {
  return [
    `Current state: ${snapshot.currentState}`,
    `Risk: ${snapshot.risk}`,
    `Evidence: ${snapshot.evidence.length > 0 ? snapshot.evidence.join(", ") : "not recorded"}`,
    `Owner: ${snapshot.owner}`,
    `Next command: ${snapshot.nextCommand}`,
  ];
}

export function renderHumanReviewerDecisionCompanion(input: DecisionCompanionSectionsInput): string[] {
  return splitDecisionCompanionSections(input);
}
