import type { AgentRole } from "./agent-runner";

export interface ResolvedFile {
  path: string;
  relativePath: string;
  schema?: string;
}

export interface ResolvedStageContract {
  stageId: string;
  stageName: string;
  role: AgentRole;
  lifecycleState: string;
  inputs: ResolvedFile[];
  outputs: ResolvedFile[];
  gates: {
    required: string[];
    optional: string[];
    autoUpdate: boolean;
  };
  traceRequired: boolean;
  constraints?: string[];
}

export class StageContractResolver {
  constructor(
    private root: string,
    private contextId: string,
    private sliceId: string
  ) {}

  resolvePath(pattern: string): string {
    const contextPath = `${this.root}/contexts/${this.contextId}`;
    const slicePath = `${contextPath}/slices/${this.sliceId}`;

    return pattern
      .replace(/\{root\}/g, this.root)
      .replace(/\{context\}/g, contextPath)
      .replace(/\{slice\}/g, slicePath);
  }

  resolveFiles(patterns: string[], schemas?: string[]): ResolvedFile[] {
    return patterns.map((pattern, index) => {
      const absolutePath = this.resolvePath(pattern);
      const relativePath = pattern
        .replace(/\{root\}\//g, "")
        .replace(/\{context\}\//g, "")
        .replace(/\{slice\}\//g, "");

      return {
        path: absolutePath,
        relativePath,
        schema: schemas?.[index],
      };
    });
  }
}
