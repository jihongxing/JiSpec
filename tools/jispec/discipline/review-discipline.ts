import type { HandoffPacket } from "../implement/handoff-packet";
import type { ReviewDiscipline } from "./types";

export function buildReviewDiscipline(packet: HandoffPacket): ReviewDiscipline {
  return {
    schemaVersion: 1,
    kind: "jispec-agent-review-discipline",
    sessionId: packet.sessionId,
    purpose: `${packet.changeIntent}: ${packet.decisionPacket.summary}`,
    impactedContracts: packet.contractContext.adoptedContractPaths,
    verificationCommands: [packet.nextSteps.verifyCommand],
    uncoveredRisks: packet.decisionPacket.mergeable ? [] : [packet.decisionPacket.summary],
    advisoryItems: packet.decisionPacket.verify.status === "passed" && packet.decisionPacket.verify.verdict === "WARN_ADVISORY"
      ? ["Post-implement verify passed with advisory follow-up."]
      : [],
    ownerDecisions: packet.decisionPacket.nextActionDetail.owner === "reviewer"
      ? ["Reviewer may proceed after normal review and CI verify."]
      : [`${packet.decisionPacket.nextActionDetail.owner} must handle ${packet.decisionPacket.nextActionDetail.type}.`],
    nextReviewerAction: packet.decisionPacket.nextAction,
    truthSources: [
      { path: `.jispec/handoff/${packet.sessionId}.json`, provenance: "EXTRACTED", note: "Implementation handoff packet." },
    ],
  };
}
