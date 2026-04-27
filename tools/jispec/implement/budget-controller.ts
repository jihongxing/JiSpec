/**
 * Budget controller for implement FSM.
 * Tracks iterations, tokens, and cost with hard limits.
 */

export interface BudgetLimits {
  maxIterations: number;
  maxTokens: number;
  maxCostUSD: number;
}

export interface BudgetState {
  iterations: number;
  tokensUsed: number;
  costUSD: number;
}

export const DEFAULT_BUDGET_LIMITS: BudgetLimits = {
  maxIterations: 10,
  maxTokens: 100000,
  maxCostUSD: 5.0,
};

export class BudgetController {
  private state: BudgetState;
  private limits: BudgetLimits;

  constructor(limits: Partial<BudgetLimits> = {}) {
    this.limits = {
      ...DEFAULT_BUDGET_LIMITS,
      ...limits,
    };
    this.state = {
      iterations: 0,
      tokensUsed: 0,
      costUSD: 0,
    };
  }

  /**
   * Check if we can continue within budget.
   */
  canContinue(): boolean {
    return (
      this.state.iterations < this.limits.maxIterations &&
      this.state.tokensUsed < this.limits.maxTokens &&
      this.state.costUSD < this.limits.maxCostUSD
    );
  }

  /**
   * Record an iteration with token and cost usage.
   */
  recordIteration(tokensUsed: number, costUSD: number): void {
    this.state.iterations += 1;
    this.state.tokensUsed += tokensUsed;
    this.state.costUSD += costUSD;
  }

  /**
   * Get current budget state.
   */
  getState(): BudgetState {
    return { ...this.state };
  }

  /**
   * Get remaining budget.
   */
  getRemainingBudget(): { iterations: number; tokens: number; costUSD: number } {
    return {
      iterations: this.limits.maxIterations - this.state.iterations,
      tokens: this.limits.maxTokens - this.state.tokensUsed,
      costUSD: this.limits.maxCostUSD - this.state.costUSD,
    };
  }

  /**
   * Get budget limits.
   */
  getLimits(): BudgetLimits {
    return { ...this.limits };
  }

  /**
   * Check which budget limit was exceeded (if any).
   */
  getExceededLimit(): "iterations" | "tokens" | "cost" | null {
    if (this.state.iterations >= this.limits.maxIterations) {
      return "iterations";
    }
    if (this.state.tokensUsed >= this.limits.maxTokens) {
      return "tokens";
    }
    if (this.state.costUSD >= this.limits.maxCostUSD) {
      return "cost";
    }
    return null;
  }
}
