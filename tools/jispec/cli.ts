import path from "node:path";
import { Command } from "commander";
import * as yaml from "js-yaml";
import { formatAgentResult, runAgent, type AgentRole } from "./agent-runner";
import { deriveAll, deriveBehavior, deriveDesign, deriveTests, syncTrace } from "./artifact-ops";
import { buildContextBoardReport } from "./context-board";
import { buildContextListReport, buildContextShowReport, buildContextStatusReport, buildSliceListReport } from "./context-report";
import { applyContextNext, applySliceNext, buildContextNextReport, buildSliceNextReport } from "./next-report";
import { buildSliceShowReport, buildSliceStatusReport } from "./slice-report";
import { advanceSlice, createSlice, updateSliceGates } from "./slice-ops";
import { planSlice } from "./slice-plan";
import { updateSliceTasks } from "./tasks";
import { buildTraceReport, validateRepository, validateSlice, validateSliceTraceOnly } from "./validator";
import * as fs from "fs";

export function buildProgram(): Command {
  const program = new Command();
  program.name("jispec").description("JiSpec repository validation CLI.");

  program
    .command("validate")
    .description("Validate JiSpec schema and trace rules.")
    .option("--root <path>", "Repository root to validate.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      const result = validateRepository(path.resolve(options.root));
      if (options.json) {
        console.log(JSON.stringify(result.toDict(), null, 2));
      } else {
        console.log(result.renderText());
      }
      process.exitCode = result.ok ? 0 : 1;
    });

  const slice = program.command("slice").description("Create and validate JiSpec slices.");

  slice
    .command("create")
    .description("Create a new slice from the repository templates.")
    .argument("<contextId>", "Owning bounded context ID.")
    .argument("<sliceId>", "New slice ID.")
    .option("--root <path>", "Repository root.", ".")
    .option("--title <title>", "Human-readable slice title.")
    .option("--goal <goal>", "Slice goal statement.")
    .option("--priority <priority>", "Slice priority.", "medium")
    .option("--product-owner <owner>", "Product owner identifier.", "unassigned-product-owner")
    .option("--engineering-owner <owner>", "Engineering owner identifier.", "unassigned-engineering-owner")
    .option("--requirement-id <id...>", "Requirement ID to attach to the slice.")
    .action(
      (
        contextId: string,
        sliceId: string,
        options: {
          root: string;
          title?: string;
          goal?: string;
          priority: string;
          productOwner: string;
          engineeringOwner: string;
          requirementId?: string[];
        },
      ) => {
        try {
          const result = createSlice({
            root: path.resolve(options.root),
            contextId,
            sliceId,
            title: options.title,
            goal: options.goal,
            priority: options.priority,
            productOwner: options.productOwner,
            engineeringOwner: options.engineeringOwner,
            requirementIds: options.requirementId,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice creation failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("list")
    .description("List slices across the repository or within one context.")
    .option("--root <path>", "Repository root.", ".")
    .option("--context <contextId>", "Optional context filter.")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; context?: string; json: boolean }) => {
      try {
        const report = buildSliceListReport(path.resolve(options.root), options.context);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("plan")
    .description("Generate a deterministic execution task plan for one slice.")
    .argument("<sliceId>", "Slice ID to plan.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing tasks.yaml.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = planSlice(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice plan failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("next")
    .description("Recommend the next highest-leverage action for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--apply", "Safely apply the recommended action when possible.", false)
    .action((sliceId: string, options: { root: string; json: boolean; apply: boolean }) => {
      try {
        const report = options.apply
          ? applySliceNext(path.resolve(options.root), sliceId)
          : buildSliceNextReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice next failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("show")
    .description("Show the full observable snapshot for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildSliceShowReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("status")
    .description("Show what is blocking the next lifecycle step for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildSliceStatusReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.readyForNextState ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec slice status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  slice
    .command("check")
    .description("Validate one slice against lifecycle, schema, and trace rules.")
    .argument("<sliceId>", "Slice ID to validate.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      const result = validateSlice(path.resolve(options.root), sliceId);
      if (options.json) {
        console.log(JSON.stringify(result.toDict(), null, 2));
      } else {
        console.log(result.renderText());
      }
      process.exitCode = result.ok ? 0 : 1;
    });

  slice
    .command("advance")
    .description("Advance one slice to its next lifecycle state when gates are satisfied.")
    .argument("<sliceId>", "Slice ID to advance.")
    .requiredOption("--to <state>", "Target lifecycle state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--set-gate <gate=true|false...>", "Apply one or more gate updates before advancing.")
    .action(
      (
        sliceId: string,
        options: {
          to: string;
          root: string;
          setGate?: string[];
        },
      ) => {
        try {
          const result = advanceSlice({
            root: path.resolve(options.root),
            sliceId,
            toState: options.to,
            gateUpdates: options.setGate,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice advance failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("update-gates")
    .description("Update one or more slice gates without advancing lifecycle state.")
    .argument("<sliceId>", "Slice ID to update.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption("--set-gate <gate=true|false...>", "Apply one or more gate updates.")
    .action(
      (
        sliceId: string,
        options: {
          root: string;
          setGate: string[];
        },
      ) => {
        try {
          const result = updateSliceGates({
            root: path.resolve(options.root),
            sliceId,
            gateUpdates: options.setGate,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice update-gates failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  slice
    .command("update-tasks")
    .description("Update one or more execution task statuses for a slice.")
    .argument("<sliceId>", "Slice ID to update.")
    .option("--root <path>", "Repository root.", ".")
    .requiredOption(
      "--set-status <task_id=pending|in_progress|completed|blocked...>",
      "Apply one or more task status updates.",
    )
    .action(
      (
        sliceId: string,
        options: {
          root: string;
          setStatus: string[];
        },
      ) => {
        try {
          const result = updateSliceTasks({
            root: path.resolve(options.root),
            sliceId,
            statusUpdates: options.setStatus,
          });
          console.log(result.renderText());
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec slice update-tasks failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  const trace = program.command("trace").description("Inspect and validate slice traceability.");

  const context = program.command("context").description("Inspect bounded contexts and their slice state.");

  context
    .command("next")
    .description("Recommend the next highest-leverage action inside one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .option("--apply", "Safely apply the top dispatch action when possible.", false)
    .action((contextId: string, options: { root: string; json: boolean; apply: boolean }) => {
      try {
        const report = options.apply
          ? applyContextNext(path.resolve(options.root), contextId)
          : buildContextNextReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context next failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("list")
    .description("List bounded contexts and their aggregate delivery state.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const report = buildContextListReport(path.resolve(options.root));
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context list failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("board")
    .description("Show a board-style grouped view for one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextBoardReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context board failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("show")
    .description("Show the aggregate delivery view for one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextShowReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  context
    .command("status")
    .description("Show what is blocking delivery progress inside one bounded context.")
    .argument("<contextId>", "Context ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((contextId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildContextStatusReport(path.resolve(options.root), contextId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.healthy ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec context status failed: ${message}`);
        process.exitCode = 1;
      }
    });

  trace
    .command("show")
    .description("Show the trace graph summary for one slice.")
    .argument("<sliceId>", "Slice ID to inspect.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const report = buildTraceReport(path.resolve(options.root), sliceId);
        if (options.json) {
          console.log(JSON.stringify(report.toDict(), null, 2));
        } else {
          console.log(report.renderText());
        }
        process.exitCode = report.validation.ok ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec trace show failed: ${message}`);
        process.exitCode = 1;
      }
    });

  trace
    .command("check")
    .description("Validate only the trace chain for one slice.")
    .argument("<sliceId>", "Slice ID to validate.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      const result = validateSliceTraceOnly(path.resolve(options.root), sliceId);
      if (options.json) {
        console.log(JSON.stringify(result.toDict(), null, 2));
      } else {
        console.log(result.renderText());
      }
      process.exitCode = result.ok ? 0 : 1;
    });

  const artifact = program.command("artifact").description("Derive slice artifacts from protocol context.");

  artifact
    .command("derive-all")
    .description("Safely derive design, behavior, tests, and trace for one slice as a single pipeline.")
    .argument("<sliceId>", "Slice ID to derive all artifacts for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveAll(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-all failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-design")
    .description("Derive a slice design.md file from slice metadata and context design assets.")
    .argument("<sliceId>", "Slice ID to derive design for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveDesign(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-design failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-behavior")
    .description("Derive a slice behaviors.feature file from context scenarios.")
    .argument("<sliceId>", "Slice ID to derive behavior for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveBehavior(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-behavior failed: ${message}`);
        process.exitCode = 1;
      }
    });

  artifact
    .command("derive-tests")
    .description("Derive test-spec and coverage-map entries from slice scenarios.")
    .argument("<sliceId>", "Slice ID to derive tests for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--force", "Overwrite existing derived files.", false)
    .action((sliceId: string, options: { root: string; force: boolean }) => {
      try {
        const result = deriveTests(path.resolve(options.root), sliceId, options.force);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact derive-tests failed: ${message}`);
        process.exitCode = 1;
        }
      });

  artifact
    .command("sync-trace")
    .description("Synchronize trace links from slice requirements, behaviors, and tests.")
    .argument("<sliceId>", "Slice ID to sync trace for.")
    .option("--root <path>", "Repository root.", ".")
    .action((sliceId: string, options: { root: string }) => {
      try {
        const result = syncTrace(path.resolve(options.root), sliceId);
        console.log(result.renderText());
        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`JiSpec artifact sync-trace failed: ${message}`);
        process.exitCode = 1;
      }
    });

  const agent = program.command("agent").description("Run AI agents to generate slice artifacts.");

  agent
    .command("run")
    .description("Run an AI agent to generate artifacts for a slice.")
    .argument("<role>", "Agent role: domain, design, behavior, test, implement, verify")
    .argument("<target>", "Target slice ID")
    .option("--root <path>", "Repository root.", ".")
    .option("--dry-run", "Show the assembled prompt without executing.", false)
    .option("--output <file>", "Override output file path.")
    .action(
      async (
        role: string,
        target: string,
        options: {
          root: string;
          dryRun: boolean;
          output?: string;
        },
      ) => {
        try {
          // Validate role
          const validRoles: AgentRole[] = ["domain", "design", "behavior", "test", "implement", "verify"];
          if (!validRoles.includes(role as AgentRole)) {
            throw new Error(
              `Invalid agent role '${role}'. Valid roles: ${validRoles.join(", ")}`,
            );
          }

          const result = await runAgent({
            root: path.resolve(options.root),
            role: role as AgentRole,
            target,
            dryRun: options.dryRun,
            output: options.output,
          });

          if (!options.dryRun) {
            console.log(formatAgentResult(result));
          }

          process.exitCode = result.success ? 0 : 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec agent run failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Pipeline command
  const pipeline = program.command("pipeline").description("Run multi-stage pipelines for slices.");

  pipeline
    .command("run")
    .description("Run the pipeline for a slice.")
    .argument("<sliceId>", "Slice ID to run pipeline for.")
    .option("--root <path>", "Repository root.", ".")
    .option("--from <stage>", "Start from a specific stage.")
    .option("--to <stage>", "Run until a specific stage.")
    .option("--dry-run", "Show what would be executed without running.", false)
    .option("--skip-validation", "Skip validation checks (dangerous).", false)
    .option("--tui", "Enable TUI visualization.", false)
    .action(
      async (
        sliceId: string,
        options: {
          root: string;
          from?: string;
          to?: string;
          dryRun: boolean;
          skipValidation: boolean;
          tui: boolean;
        },
      ) => {
        try {
          const { PipelineExecutor } = await import("./pipeline-executor");
          const executor = PipelineExecutor.create(path.resolve(options.root));

          const result = await executor.run(sliceId, {
            from: options.from,
            to: options.to,
            dryRun: options.dryRun,
            skipValidation: options.skipValidation,
            useTUI: options.tui,
          });

          console.log(PipelineExecutor.formatResult(result));

          process.exitCode = result.success ? 0 : 1;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec pipeline run failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Template command
  const template = program.command("template").description("Manage pipeline templates.");

  template
    .command("list")
    .description("List all available pipeline templates.")
    .option("--root <path>", "Repository root.", ".")
    .option("--tags <tags...>", "Filter by tags.")
    .option("--search <query>", "Search templates by name or description.")
    .action(
      async (options: {
        root: string;
        tags?: string[];
        search?: string;
      }) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          let templates = manager.listTemplates();

          if (options.tags) {
            templates = manager.filterByTags(options.tags);
          }

          if (options.search) {
            templates = manager.searchTemplates(options.search);
          }

          console.log(manager.formatTemplateList(templates));
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template list failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("show")
    .description("Show details of a specific template.")
    .argument("<templateId>", "Template ID to show.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Output as JSON.", false)
    .action(
      async (
        templateId: string,
        options: {
          root: string;
          json: boolean;
        },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          const template = manager.loadTemplate(templateId);

          if (options.json) {
            console.log(JSON.stringify(template, null, 2));
          } else {
            console.log(yaml.dump(template));
          }

          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template show failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("create-defaults")
    .description("Create default pipeline templates.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (options: { root: string }) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          manager.createDefaultTemplates();

          console.log("Default templates created successfully.");
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template create-defaults failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("clone")
    .description("Clone an existing template.")
    .argument("<sourceId>", "Source template ID.")
    .argument("<newId>", "New template ID.")
    .argument("<newName>", "New template name.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (
        sourceId: string,
        newId: string,
        newName: string,
        options: { root: string },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          const cloned = manager.cloneTemplate(sourceId, newId, newName);
          manager.saveTemplate(cloned);

          console.log(`Template cloned: ${newId}`);
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template clone failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  template
    .command("delete")
    .description("Delete a template.")
    .argument("<templateId>", "Template ID to delete.")
    .option("--root <path>", "Repository root.", ".")
    .action(
      async (
        templateId: string,
        options: { root: string },
      ) => {
        try {
          const { TemplateManager } = await import("./template-manager");
          const manager = new TemplateManager(path.resolve(options.root));

          manager.deleteTemplate(templateId);

          console.log(`Template deleted: ${templateId}`);
          process.exitCode = 0;
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`JiSpec template delete failed: ${message}`);
          process.exitCode = 1;
        }
      },
    );

  // Phase 4: 跨切片依赖管理命令
  const dependency = program.command("dependency").description("Manage cross-slice dependencies.");

  dependency
    .command("graph")
    .description("Display the dependency graph for all slices.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        if (options.json) {
          const output = {
            nodes: Array.from(graph.nodes.values()).map(node => ({
              sliceId: node.sliceId,
              state: node.state,
              dependencies: node.dependencies,
            })),
            edges: graph.edges,
          };
          console.log(JSON.stringify(output, null, 2));
        } else {
          console.log(`Dependency Graph`);
          console.log(`Total slices: ${graph.nodes.size}`);
          console.log(`Total dependencies: ${graph.edges.length}`);
          console.log();

          for (const node of graph.nodes.values()) {
            console.log(`${node.sliceId} (${node.state})`);
            if (node.dependencies.length > 0) {
              for (const dep of node.dependencies) {
                const optional = dep.optional ? " [optional]" : "";
                console.log(`  → ${dep.slice_id} (${dep.kind}, requires: ${dep.required_state})${optional}`);
              }
            } else {
              console.log(`  (no dependencies)`);
            }
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency graph failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("check")
    .description("Check for dependency issues (cycles, missing slices, etc.).")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        const cycles = builder.findCycles(graph);
        const issues: string[] = [];

        if (cycles.length > 0) {
          for (const cycle of cycles) {
            issues.push(`Cycle detected: ${cycle.join(" → ")}`);
          }
        }

        if (options.json) {
          console.log(JSON.stringify({ ok: issues.length === 0, issues }, null, 2));
        } else {
          if (issues.length === 0) {
            console.log("✓ No dependency issues found.");
          } else {
            console.log(`✗ Found ${issues.length} issue(s):`);
            for (const issue of issues) {
              console.log(`  - ${issue}`);
            }
          }
        }

        process.exitCode = issues.length === 0 ? 0 : 1;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency check failed: ${message}`);
        process.exitCode = 1;
      }
    });

  dependency
    .command("explain")
    .description("Explain dependencies for a specific slice.")
    .argument("<sliceId>", "Slice ID to explain.")
    .option("--root <path>", "Repository root.", ".")
    .option("--json", "Emit machine-readable JSON output.", false)
    .action((sliceId: string, options: { root: string; json: boolean }) => {
      try {
        const { DependencyGraphBuilder } = require("./dependency-graph");
        const builder = new DependencyGraphBuilder(path.resolve(options.root));
        const graph = builder.build();

        const node = graph.nodes.get(sliceId);
        if (!node) {
          throw new Error(`Slice '${sliceId}' not found.`);
        }

        const upstream = builder.getUpstream(graph, sliceId);
        const downstream = builder.getDownstream(graph, sliceId);

        if (options.json) {
          console.log(JSON.stringify({
            sliceId: node.sliceId,
            state: node.state,
            dependencies: node.dependencies,
            upstream,
            downstream,
          }, null, 2));
        } else {
          console.log(`Slice: ${node.sliceId}`);
          console.log(`State: ${node.state}`);
          console.log();

          console.log(`Direct dependencies (${node.dependencies.length}):`);
          if (node.dependencies.length > 0) {
            for (const dep of node.dependencies) {
              const optional = dep.optional ? " [optional]" : "";
              console.log(`  → ${dep.slice_id} (${dep.kind}, requires: ${dep.required_state})${optional}`);
            }
          } else {
            console.log(`  (none)`);
          }
          console.log();

          console.log(`All upstream dependencies (${upstream.length}):`);
          if (upstream.length > 0) {
            for (const upstreamId of upstream) {
              const upstreamNode = graph.nodes.get(upstreamId);
              console.log(`  → ${upstreamId} (${upstreamNode?.state || "unknown"})`);
            }
          } else {
            console.log(`  (none)`);
          }
          console.log();

          console.log(`All downstream dependents (${downstream.length}):`);
          if (downstream.length > 0) {
            for (const downstreamId of downstream) {
              const downstreamNode = graph.nodes.get(downstreamId);
              console.log(`  ← ${downstreamId} (${downstreamNode?.state || "unknown"})`);
            }
          } else {
            console.log(`  (none)`);
          }
        }

        process.exitCode = 0;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`Dependency explain failed: ${message}`);
        process.exitCode = 1;
      }
    });

//
//   dependency
//     .command("analyze")
//     .description("Analyze dependencies between slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output directory for reports.", ".jispec/dependencies")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (options: { root: string; output: string; json: boolean }) => {
//       try {
//         const root = path.resolve(options.root);
//         const outputDir = path.resolve(options.output);
// 
//         // 加载所有切片
//         const builder = new DependencyGraphBuilder();
//         // TODO: 实际加载切片数据
// 
//         // 构建依赖图
//         const analysis = await builder.analyze();
// 
//         // 保存报告
//         await builder.saveDependencyGraph(analysis, outputDir);
// 
//         if (options.json) {
//           console.log(JSON.stringify({
//             hasCycles: analysis.hasCycles,
//             statistics: analysis.statistics,
//           }, null, 2));
//         } else {
//           console.log("Dependency Analysis Complete");
//           console.log(`Total Nodes: ${analysis.statistics.totalNodes}`);
//           console.log(`Total Edges: ${analysis.statistics.totalEdges}`);
//           console.log(`Max Depth: ${analysis.statistics.maxDepth}`);
//           console.log(`Has Cycles: ${analysis.hasCycles}`);
//           console.log(`\nReports saved to: ${outputDir}`);
//         }
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Dependency analysis failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("detect-conflicts")
//     .description("Detect conflicts between slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output file for conflict report.", ".jispec/conflicts.json")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (options: { root: string; output: string; json: boolean }) => {
//       try {
//         const detector = new ConflictDetector();
//         // TODO: 加载切片和依赖图
// 
//         const result = await detector.detectConflicts();
// 
//         await detector.saveConflictReport(result, path.resolve(options.output));
// 
//         if (options.json) {
//           console.log(JSON.stringify(result.summary, null, 2));
//         } else {
//           console.log("Conflict Detection Complete");
//           console.log(`Total Conflicts: ${result.summary.totalConflicts}`);
//           console.log(`Critical: ${result.summary.bySeverity.critical}`);
//           console.log(`High: ${result.summary.bySeverity.high}`);
//           console.log(`Auto-resolvable: ${result.summary.autoResolvableCount}`);
//           console.log(`\nReport saved to: ${options.output}`);
//         }
// 
//         process.exitCode = result.hasConflicts ? 1 : 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Conflict detection failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("impact")
//     .description("Analyze impact of changes to a slice.")
//     .argument("<sliceId>", "Slice ID to analyze.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--change-type <type>", "Type of change: add, modify, delete, refactor.", "modify")
//     .option("--output <path>", "Output file for impact report.")
//     .option("--json", "Emit machine-readable JSON output.", false)
//     .action(async (
//       sliceId: string,
//       options: { root: string; changeType: string; output?: string; json: boolean }
//     ) => {
//       try {
//         const analyzer = new ImpactAnalyzer();
//         // TODO: 加载切片和依赖图
// 
//         const report = await analyzer.analyzeImpact(
//           sliceId,
//           options.changeType as any
//         );
// 
//         if (options.output) {
//           await analyzer.saveImpactReport(report, path.resolve(options.output));
//         }
// 
//         if (options.json) {
//           console.log(JSON.stringify(report, null, 2));
//         } else {
//           const markdown = analyzer.generateMarkdownReport(report);
//           console.log(markdown);
//         }
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Impact analysis failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });
// 
//   dependency
//     .command("resolve-versions")
//     .description("Resolve version conflicts across slices.")
//     .option("--root <path>", "Repository root.", ".")
//     .option("--output <path>", "Output file for version lock.", ".jispec/version-lock.json")
//     .option("--report <path>", "Output file for resolution report.", ".jispec/version-report.md")
//     .action(async (options: { root: string; output: string; report: string }) => {
//       try {
//         const resolver = new VersionResolver();
//         // TODO: 加载版本约束
// 
//         resolver.saveLockFile(path.resolve(options.output));
//         resolver.saveReport(path.resolve(options.report));
// 
//         console.log("Version Resolution Complete");
//         console.log(`Lock file saved to: ${options.output}`);
//         console.log(`Report saved to: ${options.report}`);
// 
//         process.exitCode = 0;
//       } catch (error) {
//         const message = error instanceof Error ? error.message : String(error);
//         console.error(`Version resolution failed: ${message}`);
//         process.exitCode = 1;
//       }
//     });

  return program;
}

export async function main(argv: string[] = process.argv): Promise<number> {
  const program = buildProgram();
  await program.parseAsync(argv);
  return typeof process.exitCode === "number" ? process.exitCode : 0;
}

if (require.main === module) {
  void main().then((code) => {
    process.exitCode = code;
  });
}
