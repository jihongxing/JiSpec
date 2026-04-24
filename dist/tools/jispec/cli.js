"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildProgram = buildProgram;
exports.main = main;
const node_path_1 = __importDefault(require("node:path"));
const commander_1 = require("commander");
const artifact_ops_1 = require("./artifact-ops");
const context_board_1 = require("./context-board");
const context_report_1 = require("./context-report");
const next_report_1 = require("./next-report");
const slice_report_1 = require("./slice-report");
const slice_ops_1 = require("./slice-ops");
const slice_plan_1 = require("./slice-plan");
const tasks_1 = require("./tasks");
const validator_1 = require("./validator");
function buildProgram() {
    const program = new commander_1.Command();
    program.name("jispec").description("JiSpec repository validation CLI.");
    program
        .command("validate")
        .description("Validate JiSpec schema and trace rules.")
        .option("--root <path>", "Repository root to validate.", ".")
        .option("--json", "Emit machine-readable JSON output.", false)
        .action((options) => {
        const result = (0, validator_1.validateRepository)(node_path_1.default.resolve(options.root));
        if (options.json) {
            console.log(JSON.stringify(result.toDict(), null, 2));
        }
        else {
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
        .action((contextId, sliceId, options) => {
        try {
            const result = (0, slice_ops_1.createSlice)({
                root: node_path_1.default.resolve(options.root),
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
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`JiSpec slice creation failed: ${message}`);
            process.exitCode = 1;
        }
    });
    slice
        .command("list")
        .description("List slices across the repository or within one context.")
        .option("--root <path>", "Repository root.", ".")
        .option("--context <contextId>", "Optional context filter.")
        .option("--json", "Emit machine-readable JSON output.", false)
        .action((options) => {
        try {
            const report = (0, context_report_1.buildSliceListReport)(node_path_1.default.resolve(options.root), options.context);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const result = (0, slice_plan_1.planSlice)(node_path_1.default.resolve(options.root), sliceId, options.force);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const report = options.apply
                ? (0, next_report_1.applySliceNext)(node_path_1.default.resolve(options.root), sliceId)
                : (0, next_report_1.buildSliceNextReport)(node_path_1.default.resolve(options.root), sliceId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const report = (0, slice_report_1.buildSliceShowReport)(node_path_1.default.resolve(options.root), sliceId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const report = (0, slice_report_1.buildSliceStatusReport)(node_path_1.default.resolve(options.root), sliceId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = report.readyForNextState ? 0 : 1;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        const result = (0, validator_1.validateSlice)(node_path_1.default.resolve(options.root), sliceId);
        if (options.json) {
            console.log(JSON.stringify(result.toDict(), null, 2));
        }
        else {
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
        .action((sliceId, options) => {
        try {
            const result = (0, slice_ops_1.advanceSlice)({
                root: node_path_1.default.resolve(options.root),
                sliceId,
                toState: options.to,
                gateUpdates: options.setGate,
            });
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`JiSpec slice advance failed: ${message}`);
            process.exitCode = 1;
        }
    });
    slice
        .command("update-gates")
        .description("Update one or more slice gates without advancing lifecycle state.")
        .argument("<sliceId>", "Slice ID to update.")
        .option("--root <path>", "Repository root.", ".")
        .requiredOption("--set-gate <gate=true|false...>", "Apply one or more gate updates.")
        .action((sliceId, options) => {
        try {
            const result = (0, slice_ops_1.updateSliceGates)({
                root: node_path_1.default.resolve(options.root),
                sliceId,
                gateUpdates: options.setGate,
            });
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`JiSpec slice update-gates failed: ${message}`);
            process.exitCode = 1;
        }
    });
    slice
        .command("update-tasks")
        .description("Update one or more execution task statuses for a slice.")
        .argument("<sliceId>", "Slice ID to update.")
        .option("--root <path>", "Repository root.", ".")
        .requiredOption("--set-status <task_id=pending|in_progress|completed|blocked...>", "Apply one or more task status updates.")
        .action((sliceId, options) => {
        try {
            const result = (0, tasks_1.updateSliceTasks)({
                root: node_path_1.default.resolve(options.root),
                sliceId,
                statusUpdates: options.setStatus,
            });
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`JiSpec slice update-tasks failed: ${message}`);
            process.exitCode = 1;
        }
    });
    const trace = program.command("trace").description("Inspect and validate slice traceability.");
    const context = program.command("context").description("Inspect bounded contexts and their slice state.");
    context
        .command("next")
        .description("Recommend the next highest-leverage action inside one bounded context.")
        .argument("<contextId>", "Context ID to inspect.")
        .option("--root <path>", "Repository root.", ".")
        .option("--json", "Emit machine-readable JSON output.", false)
        .option("--apply", "Safely apply the top dispatch action when possible.", false)
        .action((contextId, options) => {
        try {
            const report = options.apply
                ? (0, next_report_1.applyContextNext)(node_path_1.default.resolve(options.root), contextId)
                : (0, next_report_1.buildContextNextReport)(node_path_1.default.resolve(options.root), contextId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = options.apply && "applied" in report ? (report.applied ? 0 : 1) : 0;
        }
        catch (error) {
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
        .action((options) => {
        try {
            const report = (0, context_report_1.buildContextListReport)(node_path_1.default.resolve(options.root));
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((contextId, options) => {
        try {
            const report = (0, context_board_1.buildContextBoardReport)(node_path_1.default.resolve(options.root), contextId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((contextId, options) => {
        try {
            const report = (0, context_report_1.buildContextShowReport)(node_path_1.default.resolve(options.root), contextId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((contextId, options) => {
        try {
            const report = (0, context_report_1.buildContextStatusReport)(node_path_1.default.resolve(options.root), contextId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = report.healthy ? 0 : 1;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const report = (0, validator_1.buildTraceReport)(node_path_1.default.resolve(options.root), sliceId);
            if (options.json) {
                console.log(JSON.stringify(report.toDict(), null, 2));
            }
            else {
                console.log(report.renderText());
            }
            process.exitCode = report.validation.ok ? 0 : 1;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        const result = (0, validator_1.validateSliceTraceOnly)(node_path_1.default.resolve(options.root), sliceId);
        if (options.json) {
            console.log(JSON.stringify(result.toDict(), null, 2));
        }
        else {
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
        .action((sliceId, options) => {
        try {
            const result = (0, artifact_ops_1.deriveAll)(node_path_1.default.resolve(options.root), sliceId, options.force);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const result = (0, artifact_ops_1.deriveDesign)(node_path_1.default.resolve(options.root), sliceId, options.force);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const result = (0, artifact_ops_1.deriveBehavior)(node_path_1.default.resolve(options.root), sliceId, options.force);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const result = (0, artifact_ops_1.deriveTests)(node_path_1.default.resolve(options.root), sliceId, options.force);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
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
        .action((sliceId, options) => {
        try {
            const result = (0, artifact_ops_1.syncTrace)(node_path_1.default.resolve(options.root), sliceId);
            console.log(result.renderText());
            process.exitCode = 0;
        }
        catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            console.error(`JiSpec artifact sync-trace failed: ${message}`);
            process.exitCode = 1;
        }
    });
    return program;
}
async function main(argv = process.argv) {
    const program = buildProgram();
    await program.parseAsync(argv);
    return typeof process.exitCode === "number" ? process.exitCode : 0;
}
if (require.main === module) {
    void main().then((code) => {
        process.exitCode = code;
    });
}
