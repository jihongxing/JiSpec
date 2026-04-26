/**
 * Terminal State Rerun Tests
 *
 * Verifies that pipeline execution is idempotent when a slice
 * is already in a terminal state (verifying, accepted, rejected).
 * Tests real PipelineExecutor behavior, not just helper functions.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import yaml from "js-yaml";
import { PipelineExecutor } from "../pipeline-executor.js";

async function testTerminalStateIdempotency() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-terminal-"));

  try {
    // Create fixture with slice in terminal state
    const jiprojectDir = path.join(tmpDir, "jiproject");
    fs.mkdirSync(jiprojectDir, { recursive: true });

    fs.writeFileSync(
      path.join(jiprojectDir, "project.yaml"),
      `id: test-project
name: Test Project
version: 0.1.0
delivery_model: bounded-context-slice
ai:
  provider: mock
  model: test-model
`
    );

    const sliceDir = path.join(tmpDir, "contexts", "test", "slices", "test-slice-v1");
    fs.mkdirSync(sliceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sliceDir, "slice.yaml"),
      `id: test-slice-v1
context_id: test
service_id: test-service
lifecycle:
  state: accepted
gates: {}
`
    );

    fs.writeFileSync(path.join(sliceDir, "requirements.md"), "# Requirements", "utf-8");
    fs.writeFileSync(path.join(sliceDir, "design.md"), "# Design", "utf-8");

    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    fs.writeFileSync(
      path.join(agentsDir, "agents.yaml"),
      `agents:
  - id: domain-agent
    role: Domain expert
    inputs: []
    outputs: []
`
    );

    fs.writeFileSync(
      path.join(agentsDir, "pipeline.yaml"),
      `pipeline:
  name: test-pipeline
  version: 1.0
  stages:
    - id: requirements
      name: Requirements
      agent: domain
      lifecycle_state: framed
      inputs:
        files: []
        allowRead: true
        allowWrite: false
      outputs:
        files: ["{slice}/requirements.md"]
        schemas: []
        traceRequired: false
      gates:
        required: []
        optional: []
        autoUpdate: false
    - id: design
      name: Design
      agent: domain
      lifecycle_state: design-defined
      inputs:
        files: ["{slice}/requirements.md"]
        allowRead: true
        allowWrite: false
      outputs:
        files: ["{slice}/design.md"]
        schemas: []
        traceRequired: false
      gates:
        required: []
        optional: []
        autoUpdate: false
  failure_handling:
    retry:
      enabled: false
      max_attempts: 1
      backoff: fixed
      initial_delay: 0
      max_delay: 0
    rollback:
      enabled: false
      strategy: none
    human_intervention:
      enabled: false
      prompt_on_failure: false
      allow_skip: false
      allow_manual_fix: false
  parallel:
    enabled: false
    max_concurrent: 1
  progress:
    log_level: info
    log_file: ""
    report_format: json
`
    );

    // Initialize real executor
    const executor = PipelineExecutor.create(tmpDir);

    // Execute pipeline - should skip because slice is in terminal state
    await executor.run("test-slice-v1");

    // Verify state unchanged
    const sliceAfter = yaml.load(fs.readFileSync(path.join(sliceDir, "slice.yaml"), "utf-8")) as any;
    if (sliceAfter.lifecycle.state !== "accepted") {
      throw new Error(`State changed from accepted to ${sliceAfter.lifecycle.state}`);
    }

    // Verify no new artifacts created
    const files = fs.readdirSync(sliceDir);
    const expectedFiles = ["slice.yaml", "requirements.md", "design.md"];
    const unexpectedFiles = files.filter(f => !expectedFiles.includes(f));
    if (unexpectedFiles.length > 0) {
      throw new Error(`Unexpected files created: ${unexpectedFiles.join(", ")}`);
    }

    console.log("✓ Test 1: Terminal state (accepted) prevents re-execution");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function testVerifyingStateIdempotency() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "jispec-terminal-"));

  try {
    // Create fixture with slice in verifying state
    const jiprojectDir = path.join(tmpDir, "jiproject");
    fs.mkdirSync(jiprojectDir, { recursive: true });

    fs.writeFileSync(
      path.join(jiprojectDir, "project.yaml"),
      `id: test-project
name: Test Project
version: 0.1.0
delivery_model: bounded-context-slice
ai:
  provider: mock
  model: test-model
`
    );

    const sliceDir = path.join(tmpDir, "contexts", "test", "slices", "test-slice-v1");
    fs.mkdirSync(sliceDir, { recursive: true });

    fs.writeFileSync(
      path.join(sliceDir, "slice.yaml"),
      `id: test-slice-v1
context_id: test
service_id: test-service
lifecycle:
  state: verifying
gates: {}
`
    );

    fs.writeFileSync(path.join(sliceDir, "requirements.md"), "# Requirements", "utf-8");

    const agentsDir = path.join(tmpDir, "agents");
    fs.mkdirSync(agentsDir, { recursive: true });

    fs.writeFileSync(
      path.join(agentsDir, "agents.yaml"),
      `agents:
  - id: domain-agent
    role: Domain expert
    inputs: []
    outputs: []
`
    );

    fs.writeFileSync(
      path.join(agentsDir, "pipeline.yaml"),
      `pipeline:
  name: test-pipeline
  version: 1.0
  stages:
    - id: requirements
      name: Requirements
      agent: domain
      lifecycle_state: framed
      inputs:
        files: []
        allowRead: true
        allowWrite: false
      outputs:
        files: ["{slice}/requirements.md"]
        schemas: []
        traceRequired: false
      gates:
        required: []
        optional: []
        autoUpdate: false
  failure_handling:
    retry:
      enabled: false
      max_attempts: 1
      backoff: fixed
      initial_delay: 0
      max_delay: 0
    rollback:
      enabled: false
      strategy: none
    human_intervention:
      enabled: false
      prompt_on_failure: false
      allow_skip: false
      allow_manual_fix: false
  parallel:
    enabled: false
    max_concurrent: 1
  progress:
    log_level: info
    log_file: ""
    report_format: json
`
    );

    // Initialize real executor
    const executor = PipelineExecutor.create(tmpDir);

    // Execute pipeline - should skip because slice is verifying
    await executor.run("test-slice-v1");

    // Verify state unchanged
    const sliceAfter = yaml.load(fs.readFileSync(path.join(sliceDir, "slice.yaml"), "utf-8")) as any;
    if (sliceAfter.lifecycle.state !== "verifying") {
      throw new Error(`State changed from verifying to ${sliceAfter.lifecycle.state}`);
    }

    console.log("✓ Test 2: Terminal state (verifying) prevents re-execution");

    // Cleanup
    fs.rmSync(tmpDir, { recursive: true, force: true });
    return true;
  } catch (error) {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    throw error;
  }
}

async function main() {
  console.log("=== Terminal State Rerun Tests ===\n");

  let passed = 0;
  let failed = 0;

  try {
    await testTerminalStateIdempotency();
    passed++;
  } catch (error: any) {
    console.error("✗ Test 1 failed:", error.message);
    failed++;
  }

  try {
    await testVerifyingStateIdempotency();
    passed++;
  } catch (error: any) {
    console.error("✗ Test 2 failed:", error.message);
    failed++;
  }

  console.log(`\n${passed}/${passed + failed} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error("Test suite failed:", error);
  process.exit(1);
});
