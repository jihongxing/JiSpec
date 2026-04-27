/**
 * Episode memory for implement FSM.
 * Tracks attempted hypotheses and rejected paths across iterations.
 */

export interface Episode {
  iteration: number;
  hypothesis: string;
  outcome: "success" | "failure";
  changedFiles: string[];
  errorMessage?: string;
  timestamp: string;
}

export interface EpisodeMemory {
  episodes: Episode[];
  rejectedPaths: Set<string>;
}

/**
 * Create a new episode memory.
 */
export function createEpisodeMemory(): EpisodeMemory {
  return {
    episodes: [],
    rejectedPaths: new Set(),
  };
}

/**
 * Add an episode to memory.
 */
export function addEpisode(
  memory: EpisodeMemory,
  episode: Omit<Episode, "timestamp">,
): void {
  memory.episodes.push({
    ...episode,
    timestamp: new Date().toISOString(),
  });

  // Track rejected paths (files that were changed but tests still failed)
  if (episode.outcome === "failure") {
    for (const file of episode.changedFiles) {
      memory.rejectedPaths.add(file);
    }
  }
}

/**
 * Get recent hypotheses (last N episodes).
 */
export function getRecentHypotheses(
  memory: EpisodeMemory,
  count: number = 5,
): string[] {
  return memory.episodes
    .slice(-count)
    .map((ep) => ep.hypothesis)
    .filter((h) => h && h.trim().length > 0);
}

/**
 * Get rejected paths.
 */
export function getRejectedPaths(memory: EpisodeMemory): string[] {
  return Array.from(memory.rejectedPaths).sort();
}

/**
 * Get all episodes.
 */
export function getAllEpisodes(memory: EpisodeMemory): Episode[] {
  return [...memory.episodes];
}

/**
 * Get episodes by outcome.
 */
export function getEpisodesByOutcome(
  memory: EpisodeMemory,
  outcome: "success" | "failure",
): Episode[] {
  return memory.episodes.filter((ep) => ep.outcome === outcome);
}

/**
 * Get last N episodes.
 */
export function getLastEpisodes(
  memory: EpisodeMemory,
  count: number,
): Episode[] {
  return memory.episodes.slice(-count);
}

/**
 * Check if a hypothesis was already attempted.
 */
export function wasHypothesisAttempted(
  memory: EpisodeMemory,
  hypothesis: string,
): boolean {
  const normalized = hypothesis.trim().toLowerCase();
  return memory.episodes.some(
    (ep) => ep.hypothesis.trim().toLowerCase() === normalized,
  );
}

/**
 * Check if a file was already rejected.
 */
export function wasFileRejected(
  memory: EpisodeMemory,
  filePath: string,
): boolean {
  return memory.rejectedPaths.has(filePath);
}

/**
 * Get episode count.
 */
export function getEpisodeCount(memory: EpisodeMemory): number {
  return memory.episodes.length;
}

/**
 * Format episode memory for display.
 */
export function formatEpisodeMemory(memory: EpisodeMemory): string {
  const lines: string[] = [];

  lines.push("=== Episode Memory ===");
  lines.push(`Total episodes: ${memory.episodes.length}`);
  lines.push(`Rejected paths: ${memory.rejectedPaths.size}`);
  lines.push("");

  if (memory.episodes.length > 0) {
    lines.push("Recent episodes:");
    const recent = getLastEpisodes(memory, 5);
    for (const ep of recent) {
      const status = ep.outcome === "success" ? "✓" : "✗";
      lines.push(`  ${status} Iteration ${ep.iteration}: ${ep.hypothesis}`);
      if (ep.changedFiles.length > 0) {
        lines.push(`    Changed: ${ep.changedFiles.join(", ")}`);
      }
      if (ep.errorMessage) {
        lines.push(`    Error: ${ep.errorMessage.substring(0, 100)}...`);
      }
    }
    lines.push("");
  }

  if (memory.rejectedPaths.size > 0) {
    lines.push("Rejected paths:");
    for (const path of getRejectedPaths(memory)) {
      lines.push(`  - ${path}`);
    }
  }

  return lines.join("\n");
}

/**
 * Serialize episode memory to JSON.
 */
export function serializeEpisodeMemory(memory: EpisodeMemory): string {
  return JSON.stringify(
    {
      episodes: memory.episodes,
      rejectedPaths: Array.from(memory.rejectedPaths),
    },
    null,
    2,
  );
}

/**
 * Deserialize episode memory from JSON.
 */
export function deserializeEpisodeMemory(json: string): EpisodeMemory {
  const data = JSON.parse(json);
  return {
    episodes: data.episodes || [],
    rejectedPaths: new Set(data.rejectedPaths || []),
  };
}
