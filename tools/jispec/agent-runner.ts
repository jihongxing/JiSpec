import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type { AIConfig } from "./ai-provider";
import { AIProviderFactory } from "./ai-provider-factory";
import { findSliceFile, validateSlice } from "./validator";
import { InputConstraintChecker } from "./constraint-checker";
import { OutputValidator } from "./output-validator";
import { GateChecker } from "./gate-checker";
import { TraceManager } from "./trace-manager";

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
  target: string; // slice-id
  dryRun?: boolean;
  output?: string;
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
 * Assemble execution context for an agent
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
    role: config.role,
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

    // 2. Assemble execution context
    const context = assembleAgentContext(options.root, config, options.target);

    // 3. Dry run mode: just show the prompt
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

      return {
        success: true,
        role: options.role,
        sliceId: options.target,
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

    // 7. Save output
    const outputPath = options.output || context.outputs[0]?.path;
    if (outputPath && output) {
      console.log(`\n[Output] Saving to ${outputPath}...`);
      fs.mkdirSync(path.dirname(outputPath), { recursive: true });
      fs.writeFileSync(outputPath, output, "utf-8");
      console.log("[Output] ✓ Output saved");
    }

    // 8. Validate output
    console.log("\n[Validation] Validating output...");
    const outputValidator = OutputValidator.create({
      files: context.outputs.map((f) => f.path),
      schemas: context.outputs.map((f) => f.expectedSchema).filter(Boolean) as string[],
      traceRequired: false, // Will be set based on stage
    });
    const outputCheck = await outputValidator.validate();
    if (!outputCheck.passed) {
      const errorMsg = OutputValidator.formatErrors(outputCheck.errors);
      console.error(`[Validation] ✗ Output validation failed:\n${errorMsg}`);
      // Don't throw, just report
    } else {
      console.log("[Validation] ✓ Output validation passed");
    }

    // 9. Check and update gates (if configured)
    console.log("\n[Gates] Checking gates...");
    const gateChecker = GateChecker.create(options.target, {
      required: [], // Will be determined by stage
      optional: [],
      autoUpdate: true,
    });
    const gateCheck = await gateChecker.check();
    console.log(GateChecker.formatCheckResult(gateCheck));

    // 10. Update trace (if needed)
    // This will be implemented in Phase 3 when we have pipeline stages

    return {
      success: outputCheck.passed,
      role: options.role,
      sliceId: options.target,
      output,
      outputPath,
      validation: {
        ok: outputCheck.passed,
        errors: outputCheck.errors.map((e) => e.message),
      },
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
 * Load AI configuration from jiproject.yaml
 */
function loadAIConfig(slicePath: string): AIConfig | undefined {
  // Try to find jiproject.yaml by walking up the directory tree
  let currentDir = slicePath;
  const root = path.parse(currentDir).root;

  while (currentDir !== root) {
    const jiprojectPath = path.join(currentDir, "jiproject", "jiproject.yaml");
    if (fs.existsSync(jiprojectPath)) {
      const content = fs.readFileSync(jiprojectPath, "utf-8");
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
