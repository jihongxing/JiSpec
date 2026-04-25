import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import type { AIConfig } from "./ai-provider";
import { AIProviderFactory } from "./ai-provider-factory";
import { findSliceFile, validateSlice } from "./validator";
import { InputConstraintChecker } from "./constraint-checker";
import { OutputValidator } from "./output-validator";
import { GateChecker } from "./gate-checker";
import { TraceManager } from "./trace-manager";
import type { ResolvedStageContract } from "./stage-contract";
import type { StageExecutionResult, FileWrite, GateUpdate, TraceLink, Evidence } from "./stage-execution-result";

/**
 * Agent role types supported by the system
 */
export type AgentRole = "domain" | "design" | "behavior" | "test" | "implement" | "verify";

/**
 * Options for running an agent
 */
export interface AgentRunOptions {
  root: string;
  role: AgentRole;
  target: string;
  dryRun?: boolean;
  output?: string;
  contract?: ResolvedStageContract;
}

/**
 * Agent configuration from agents.yaml
 */
export interface AgentConfig {
  id: string;
  role: string; // description of the role
  inputs: string[];
  outputs: string[];
  scope?: string[];
  constraints?: string[];
  prompt_template?: string;
}

/**
 * Agent execution context
 */
export interface AgentContext {
  role: AgentRole;
  sliceId: string;
  contextId: string;
  slicePath: string;
  inputs: ReadonlyFile[];
  outputs: WritableFile[];
  constraints: string[];
  prompt: string;
}

/**
 * File reference with content
 */
export interface ReadonlyFile {
  path: string;
  relativePath: string;
  content: string;
  exists: boolean;
}

export interface WritableFile {
  path: string;
  relativePath: string;
  expectedSchema?: string;
}

/**
 * Agent execution result
 */
export interface AgentResult {
  success: boolean;
  role: AgentRole;
  sliceId: string;
  output?: string;
  outputPath?: string;
  validation?: {
    ok: boolean;
    errors: string[];
  };
  error?: string;
  // 结构化结果（新增）
  executionResult?: StageExecutionResult;
}

/**
 * Load agent configuration from agents.yaml
 */
export function loadAgentConfig(root: string, role: AgentRole): AgentConfig {
  const agentsPath = path.join(root, "agents", "agents.yaml");

  if (!fs.existsSync(agentsPath)) {
    throw new Error(`agents.yaml not found at ${agentsPath}`);
  }

  const content = fs.readFileSync(agentsPath, "utf-8");
  const config = yaml.load(content) as any;

  if (!config.agents || !Array.isArray(config.agents)) {
    throw new Error("Invalid agents.yaml: missing 'agents' array");
  }

  // Map role names to agent IDs
  const roleToId: Record<AgentRole, string> = {
    domain: "domain-agent",
    design: "design-agent",
    behavior: "behavior-agent",
    test: "test-agent",
    implement: "build-agent",
    verify: "review-agent",
  };

  const agentId = roleToId[role];
  const agentConfig = config.agents.find((a: any) => a.id === agentId);

  if (!agentConfig) {
    throw new Error(`Agent role '${role}' (id: ${agentId}) not found in agents.yaml`);
  }

  return agentConfig as AgentConfig;
}

/**
 * Assemble execution context from contract (pipeline-driven)
 */
export function assembleAgentContextFromContract(
  root: string,
  config: AgentConfig,
  sliceId: string,
  contract: ResolvedStageContract
): AgentContext {
  // Find and load slice metadata
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice '${sliceId}' not found`);
  }

  const sliceContent = fs.readFileSync(sliceFile, "utf-8");
  const slice = yaml.load(sliceContent) as any;

  const contextId = slice.context_id;
  const slicePath = path.dirname(sliceFile);

  // Use contract inputs
  const inputs: ReadonlyFile[] = contract.inputs.map((input) => {
    const exists = fs.existsSync(input.path);
    let content = "";

    if (exists) {
      const stat = fs.statSync(input.path);
      if (stat.isDirectory()) {
        // For directories, list files recursively
        const files = fs.readdirSync(input.path, { recursive: true, withFileTypes: true });
        const fileList = files
          .filter(f => f.isFile())
          .map(f => path.join(f.path, f.name).replace(/\\/g, '/'))
          .join('\n');
        content = `[Directory listing]\n${fileList}`;
      } else {
        content = fs.readFileSync(input.path, "utf-8");
      }
    }

    return {
      path: input.path,
      relativePath: input.relativePath,
      content,
      exists,
    };
  });

  // Use contract outputs
  const outputs: WritableFile[] = contract.outputs.map((output) => ({
    path: output.path,
    relativePath: output.relativePath,
    expectedSchema: output.schema,
  }));

  // Assemble prompt
  const prompt = assemblePrompt(config, slice, inputs, outputs);

  return {
    role: contract.role,
    sliceId,
    contextId,
    slicePath,
    inputs,
    outputs,
    constraints: contract.constraints || config.constraints || [],
    prompt,
  };
}

/**
 * Assemble execution context for an agent (legacy)
 */
export function assembleAgentContext(
  root: string,
  config: AgentConfig,
  sliceId: string
): AgentContext {
  // Find and load slice metadata
  const sliceFile = findSliceFile(root, sliceId);
  if (!sliceFile) {
    throw new Error(`Slice '${sliceId}' not found`);
  }

  const sliceContent = fs.readFileSync(sliceFile, "utf-8");
  const slice = yaml.load(sliceContent) as any;

  const contextId = slice.context_id;
  const slicePath = path.dirname(sliceFile);

  // Resolve input files
  const inputs: ReadonlyFile[] = [];
  for (const inputPattern of config.inputs) {
    const files = resolveFilePattern(root, contextId, sliceId, inputPattern);
    for (const filePath of files) {
      const exists = fs.existsSync(filePath);
      const content = exists ? fs.readFileSync(filePath, "utf-8") : "";
      inputs.push({
        path: filePath,
        relativePath: path.relative(root, filePath),
        content,
        exists,
      });
    }
  }

  // Resolve output files
  const outputs: WritableFile[] = [];
  for (const outputPattern of config.outputs) {
    const files = resolveFilePattern(root, contextId, sliceId, outputPattern);
    for (const filePath of files) {
      outputs.push({
        path: filePath,
        relativePath: path.relative(root, filePath),
      });
    }
  }

  // Assemble prompt
  const prompt = assemblePrompt(config, slice, inputs, outputs);

  return {
    role: config.role as AgentRole,
    sliceId,
    contextId,
    slicePath,
    inputs,
    outputs,
    constraints: config.constraints || [],
    prompt,
  };
}

/**
 * Resolve file patterns to actual file paths
 * Patterns can include:
 * - {context}/context.yaml
 * - {context}/contracts.yaml
 * - {slice}/slice.yaml
 * - {slice}/requirements.md
 */
function resolveFilePattern(
  root: string,
  contextId: string,
  sliceId: string,
  pattern: string
): string[] {
  const contextPath = path.join(root, "contexts", contextId);
  const slicePath = path.join(contextPath, "slices", sliceId);

  let resolved = pattern
    .replace("{context}", contextPath)
    .replace("{slice}", slicePath)
    .replace("{root}", root);

  // Handle glob patterns (simple implementation)
  if (resolved.includes("*")) {
    // For now, just return the pattern as-is
    // TODO: implement proper glob matching
    return [resolved];
  }

  return [resolved];
}

/**
 * Assemble the prompt for the agent
 */
function assemblePrompt(
  config: AgentConfig,
  slice: any,
  inputs: ReadonlyFile[],
  outputs: WritableFile[]
): string {
  const sections: string[] = [];

  // Role and description
  sections.push(`# Agent: ${config.id}`);
  sections.push(`\n${config.role}\n`);

  // Slice context
  sections.push(`## Slice Context`);
  sections.push(`- Slice ID: ${slice.id}`);
  sections.push(`- Title: ${slice.title || slice.id}`);
  sections.push(`- Goal: ${slice.goal || "N/A"}`);
  sections.push(`- Current State: ${slice.lifecycle?.state || slice.status || "unknown"}`);
  sections.push(`- Priority: ${slice.priority || "medium"}\n`);

  // Input files (read-only)
  sections.push(`## Input Files (Read-Only)`);
  sections.push(`\nThese files are your inputs. You MUST NOT modify them.\n`);
  for (const input of inputs) {
    sections.push(`### ${input.relativePath}`);
    if (input.exists) {
      sections.push(`\`\`\`\n${input.content}\n\`\`\``);
    } else {
      sections.push(`(File does not exist yet)`);
    }
    sections.push("");
  }

  // Output files (writable)
  sections.push(`## Output Files (Your Task)`);
  sections.push(`\nYou must generate or update these files:\n`);
  for (const output of outputs) {
    sections.push(`- ${output.relativePath}`);
  }
  sections.push("");

  // Constraints
  if (config.constraints && config.constraints.length > 0) {
    sections.push(`## Constraints`);
    sections.push(`\nYou MUST follow these constraints:\n`);
    for (const constraint of config.constraints) {
      sections.push(`- ${constraint}`);
    }
    sections.push("");
  }

  // Scope
  if (config.scope && config.scope.length > 0) {
    sections.push(`## Scope`);
    sections.push(`\nYou are allowed to access these directories:\n`);
    for (const scopeItem of config.scope) {
      sections.push(`- ${scopeItem}`);
    }
    sections.push("");
  }

  // Custom prompt template
  if (config.prompt_template) {
    sections.push(`## Instructions`);
    sections.push(`\n${config.prompt_template}\n`);
  }

  return sections.join("\n");
}

/**
 * Run an agent (main entry point)
 */
export async function runAgent(options: AgentRunOptions): Promise<AgentResult> {
  try {
    // 1. Load agent configuration
    const config = loadAgentConfig(options.root, options.role);

    // 2. Assemble execution context (use contract if provided)
    const context = options.contract
      ? assembleAgentContextFromContract(options.root, config, options.target, options.contract)
      : assembleAgentContext(options.root, config, options.target);

    // 3. Dry run mode: just show the prompt and return execution result
    if (options.dryRun) {
      console.log("\n=== DRY RUN MODE ===\n");
      console.log("Agent Context:");
      console.log(`  Role: ${context.role}`);
      console.log(`  Slice: ${context.sliceId}`);
      console.log(`  Context: ${context.contextId}`);
      console.log(`\nInput Files (${context.inputs.length}):`);
      for (const input of context.inputs) {
        console.log(`  - ${input.relativePath} ${input.exists ? "✓" : "✗"}`);
      }
      console.log(`\nOutput Files (${context.outputs.length}):`);
      for (const output of context.outputs) {
        console.log(`  - ${output.relativePath}`);
      }
      console.log(`\nConstraints (${context.constraints.length}):`);
      for (const constraint of context.constraints) {
        console.log(`  - ${constraint}`);
      }
      console.log("\n=== ASSEMBLED PROMPT ===\n");
      console.log(context.prompt);
      console.log("\n=== END DRY RUN ===\n");

      // Return empty execution result for dry-run
      const executionResult: StageExecutionResult = {
        success: true,
        writes: [],
        gateUpdates: [],
        traceLinks: [],
        evidence: [],
      };

      return {
        success: true,
        role: options.role,
        sliceId: options.target,
        executionResult,
      };
    }

    // 4. Create input constraint checker and snapshot
    console.log("\n[Constraint] Creating input file snapshots...");
    const inputChecker = InputConstraintChecker.create({
      files: context.inputs.map((f) => f.path),
      allowRead: true,
      allowWrite: false,
    });
    await inputChecker.snapshot();
    console.log("[Constraint] ✓ Input snapshots created");

    // 5. Call AI to generate output
    console.log("\n[Agent] Calling AI provider...");
    const output = await callAI(context);
    console.log("[Agent] ✓ AI generation completed");

    // 6. Verify input files were not modified
    console.log("\n[Constraint] Verifying input files...");
    const inputCheck = await inputChecker.verify();
    if (!inputCheck.passed) {
      const errorMsg = InputConstraintChecker.formatViolations(inputCheck.violations);
      console.error(`[Constraint] ✗ Input constraint violated:\n${errorMsg}`);
      throw new Error(`Input constraint violated: ${errorMsg}`);
    }
    console.log("[Constraint] ✓ Input files unchanged");

    // 7. Parse output and collect writes
    console.log("\n[Output] Parsing agent output...");
    const writes: FileWrite[] = [];
    let parsedOutput: any = null;

    // Try to parse as structured JSON output
    if (output) {
      try {
        parsedOutput = JSON.parse(output);
        console.log("[Output] ✓ Parsed structured JSON output");

        // Validate against schema
        const schemaPath = path.join(options.root, "schemas", "agent-output.schema.json");
        if (fs.existsSync(schemaPath)) {
          const schema = JSON.parse(fs.readFileSync(schemaPath, "utf-8"));
          const ajv = new Ajv2020({ allErrors: true, strict: false, validateFormats: false });
          addFormats(ajv);
          const validate = ajv.compile(schema);

          if (!validate(parsedOutput)) {
            const errors = validate.errors?.map(e => `${e.instancePath} ${e.message}`).join(", ") || "Unknown error";
            console.error(`[Output] ✗ Schema validation failed: ${errors}`);
            throw new Error(`Agent output does not match schema: ${errors}`);
          }
          console.log("[Output] ✓ Schema validation passed");
        }
      } catch (e) {
        if (e instanceof Error && e.message.includes("schema")) {
          // Schema validation error, re-throw
          throw e;
        }
        // Not JSON, treat as plain text
        console.log("[Output] Plain text output (not JSON)");
      }
    }

    // If structured output, use it directly
    if (parsedOutput && typeof parsedOutput === 'object' && ('writes' in parsedOutput || 'writeOperations' in parsedOutput)) {
      console.log("[Output] Using structured output protocol");

      // Check if the agent reported failure
      if (parsedOutput.success === false) {
        const errorMsg = parsedOutput.error || "Agent reported failure";
        console.error(`[Output] ✗ Agent execution failed: ${errorMsg}`);
        throw new Error(errorMsg);
      }

      writes.push(...(parsedOutput.writes || []));
    } else if (output) {
      // Fallback: treat as plain text and save to output paths
      if (context.outputs.length === 1) {
        // Single output: save to specified path or first output
        const outputPath = options.output || context.outputs[0]?.path;
        if (outputPath) {
          writes.push({
            path: outputPath,
            content: output,
            encoding: "utf-8",
          });
        }
      } else {
        // Multiple outputs: save to all output paths
        for (const outputFile of context.outputs) {
          writes.push({
            path: outputFile.path,
            content: output,
            encoding: "utf-8",
          });
        }
      }
    }

    // 7b. No longer write files directly - StageRunner will apply writes
    console.log(`\n[Output] Collected ${writes.length} file write(s) for StageRunner to apply`);

    // 8. Build structured execution result (no validation here)
    const executionResult: StageExecutionResult = {
      success: true,  // Generation succeeded
      writes,
      writeOperations: parsedOutput?.writeOperations || [],
      gateUpdates: parsedOutput?.gateUpdates || [],
      traceLinks: parsedOutput?.traceLinks || [],
      evidence: parsedOutput?.evidence || [
        {
          type: "agent_execution",
          content: JSON.stringify({ role: options.role, sliceId: options.target }),
          timestamp: new Date().toISOString(),
        },
      ],
    };

    return {
      success: true,  // Generation succeeded
      role: options.role,
      sliceId: options.target,
      output,
      executionResult,
    };
  } catch (error) {
    return {
      success: false,
      role: options.role,
      sliceId: options.target,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Call AI to generate output
 */
async function callAI(context: AgentContext): Promise<string> {
  // 1. Load AI configuration from jiproject.yaml
  const aiConfig = loadAIConfig(context.slicePath);

  // 2. Create AI provider
  const provider = AIProviderFactory.create(aiConfig);

  // 3. Check if provider is available
  const available = await provider.isAvailable();
  if (!available) {
    throw new Error(
      `AI provider '${provider.name}' is not available. Please check your configuration.`
    );
  }

  // 4. Call provider to generate output
  console.log(`\nUsing AI provider: ${provider.name}`);
  const output = await provider.generate(context.prompt, aiConfig?.options);

  return output;
}

/**
 * Load AI configuration from jiproject/project.yaml
 */
function loadAIConfig(slicePath: string): AIConfig | undefined {
  // Try to find jiproject/project.yaml by walking up the directory tree
  let currentDir = slicePath;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const projectPath = path.join(currentDir, "jiproject", "project.yaml");
    if (fs.existsSync(projectPath)) {
      const content = fs.readFileSync(projectPath, "utf-8");
      const config = yaml.load(content) as any;
      return config?.ai;
    }

    // Move up one directory
    const parentDir = path.dirname(currentDir);
    if (parentDir === currentDir) break;
    currentDir = parentDir;
  }

  // No configuration found, use default (stdio)
  return undefined;
}

/**
 * Format agent result as text report
 */
export function formatAgentResult(result: AgentResult): string {
  const lines: string[] = [];

  lines.push(`\n=== Agent Execution Result ===\n`);
  lines.push(`Role: ${result.role}`);
  lines.push(`Slice: ${result.sliceId}`);
  lines.push(`Success: ${result.success ? "✓" : "✗"}\n`);

  if (result.error) {
    lines.push(`Error: ${result.error}\n`);
  }

  if (result.outputPath) {
    lines.push(`Output saved to: ${result.outputPath}\n`);
  }

  if (result.validation) {
    lines.push(`Validation: ${result.validation.ok ? "✓ PASSED" : "✗ FAILED"}`);
    if (!result.validation.ok && result.validation.errors.length > 0) {
      lines.push(`\nValidation Errors:`);
      for (const error of result.validation.errors) {
        lines.push(`  - ${error}`);
      }
    }
  }

  lines.push("");

  return lines.join("\n");
}
