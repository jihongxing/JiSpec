import { createKernelId, type KernelIdentity } from "./shared-models";
import type { ChangeSession } from "../change/change-session";

export interface KernelProvenanceBinding extends KernelIdentity {
  changeId: string;
  changeSessionId: string;
  source: "active_change_session" | "archived_change_session";
}

export function resolveCanonicalChangeId(session?: Pick<ChangeSession, "id" | "createdAt" | "changeId" | "specDelta"> | null): string | undefined {
  if (!session) {
    return undefined;
  }

  return session.changeId ?? session.specDelta?.changeId ?? session.id;
}

export function buildKernelProvenanceBinding(session: Pick<ChangeSession, "id" | "createdAt" | "changeId" | "specDelta">, source: KernelProvenanceBinding["source"] = "active_change_session"): KernelProvenanceBinding {
  const canonicalChangeId = resolveCanonicalChangeId(session);
  if (!canonicalChangeId) {
    throw new Error("Cannot build provenance binding without a canonical change id.");
  }

  return {
    id: createKernelId("provenance", `${session.id}|${canonicalChangeId}`),
    createdAt: session.createdAt,
    changeId: canonicalChangeId,
    changeSessionId: session.id,
    source,
  };
}
