/**
 * Stall detector for implement FSM.
 * Detects when AI is stuck and should stop early.
 */

export interface StallCheckResult {
  isStalled: boolean;
  reason?: "repeated_failures" | "oscillation" | "no_progress";
  details?: string;
}

interface IterationRecord {
  iteration: number;
  testPassed: boolean;
  changedFiles: string[];
  errorSignature?: string;
}

export class StallDetector {
  private records: IterationRecord[] = [];
  private readonly repeatedFailureThreshold = 3;
  private readonly oscillationThreshold = 2;
  private readonly noProgressThreshold = 5;

  /**
   * Record an iteration.
   */
  recordIteration(
    testPassed: boolean,
    changedFiles: string[],
    errorMessage?: string,
  ): void {
    const errorSignature = errorMessage
      ? this.computeErrorSignature(errorMessage)
      : undefined;

    this.records.push({
      iteration: this.records.length + 1,
      testPassed,
      changedFiles: [...changedFiles],
      errorSignature,
    });
  }

  /**
   * Check if stalled.
   */
  checkStall(): StallCheckResult {
    // Check no progress first so completely stuck loops produce the most actionable reason.
    const noProgress = this.checkNoProgress();
    if (noProgress.isStalled) {
      return noProgress;
    }

    // Check repeated failures
    const repeatedFailure = this.checkRepeatedFailures();
    if (repeatedFailure.isStalled) {
      return repeatedFailure;
    }

    // Check oscillation
    const oscillation = this.checkOscillation();
    if (oscillation.isStalled) {
      return oscillation;
    }

    return { isStalled: false };
  }

  /**
   * Check for repeated failures with same error.
   */
  private checkRepeatedFailures(): StallCheckResult {
    if (this.records.length < this.repeatedFailureThreshold) {
      return { isStalled: false };
    }

    const recent = this.records.slice(-this.repeatedFailureThreshold);

    // All must be failures
    if (!recent.every((r) => !r.testPassed)) {
      return { isStalled: false };
    }

    // All must have error signatures
    if (!recent.every((r) => r.errorSignature)) {
      return { isStalled: false };
    }

    // All must have same error signature
    const firstSignature = recent[0].errorSignature;
    if (!recent.every((r) => r.errorSignature === firstSignature)) {
      return { isStalled: false };
    }

    return {
      isStalled: true,
      reason: "repeated_failures",
      details: `${this.repeatedFailureThreshold} consecutive failures with same error: ${firstSignature}`,
    };
  }

  /**
   * Check for oscillation (same file changed back and forth).
   */
  private checkOscillation(): StallCheckResult {
    if (this.records.length < 3) {
      return { isStalled: false };
    }

    // Build file change frequency map
    const fileChangeCount = new Map<string, number>();

    for (const record of this.records) {
      for (const file of record.changedFiles) {
        fileChangeCount.set(file, (fileChangeCount.get(file) || 0) + 1);
      }
    }

    // Check if any file was changed more than oscillationThreshold times
    for (const [file, count] of fileChangeCount.entries()) {
      if (count >= this.oscillationThreshold) {
        // Verify it's actually oscillating (changed in non-consecutive iterations)
        const iterations = this.records
          .map((r, idx) => (r.changedFiles.includes(file) ? idx : -1))
          .filter((idx) => idx >= 0);

        // Check if there are gaps (non-consecutive changes)
        let hasGaps = false;
        for (let i = 1; i < iterations.length; i++) {
          if (iterations[i] - iterations[i - 1] > 1) {
            hasGaps = true;
            break;
          }
        }

        if (hasGaps) {
          return {
            isStalled: true,
            reason: "oscillation",
            details: `File ${file} changed ${count} times in non-consecutive iterations`,
          };
        }
      }
    }

    return { isStalled: false };
  }

  /**
   * Check for no progress (no new files changed).
   */
  private checkNoProgress(): StallCheckResult {
    if (this.records.length < this.noProgressThreshold) {
      return { isStalled: false };
    }

    const recent = this.records.slice(-this.noProgressThreshold);

    // Collect all unique files changed in recent iterations
    const allFiles = new Set<string>();
    for (const record of recent) {
      for (const file of record.changedFiles) {
        allFiles.add(file);
      }
    }

    // If no files were changed at all, that's stalled
    if (allFiles.size === 0) {
      return {
        isStalled: true,
        reason: "no_progress",
        details: `No files changed in last ${this.noProgressThreshold} iterations`,
      };
    }

    // Check if the same small set of files keeps being changed
    // (no new files introduced in recent iterations)
    const firstIterationFiles = new Set(recent[0].changedFiles);
    let hasNewFiles = false;

    for (let i = 1; i < recent.length; i++) {
      for (const file of recent[i].changedFiles) {
        if (!firstIterationFiles.has(file)) {
          hasNewFiles = true;
          break;
        }
      }
      if (hasNewFiles) break;
    }

    if (!hasNewFiles && allFiles.size > 0) {
      return {
        isStalled: true,
        reason: "no_progress",
        details: `Same ${allFiles.size} file(s) changed repeatedly with no new files in last ${this.noProgressThreshold} iterations`,
      };
    }

    return { isStalled: false };
  }

  /**
   * Compute error signature from error message.
   * Normalizes error message to detect repeated errors.
   */
  private computeErrorSignature(errorMessage: string): string {
    // Take first 200 chars and normalize
    let signature = errorMessage.substring(0, 200).trim();

    // Remove line numbers, file paths, timestamps
    signature = signature.replace(/:\d+:\d+/g, ":*:*"); // line:col
    signature = signature.replace(/line \d+/gi, "line *");
    signature = signature.replace(/\d{4}-\d{2}-\d{2}/g, "****-**-**"); // dates
    signature = signature.replace(/\d{2}:\d{2}:\d{2}/g, "**:**:**"); // times

    return signature;
  }

  /**
   * Get iteration count.
   */
  getIterationCount(): number {
    return this.records.length;
  }

  /**
   * Get all records.
   */
  getRecords(): IterationRecord[] {
    return [...this.records];
  }

  /**
   * Reset detector.
   */
  reset(): void {
    this.records = [];
  }
}
