/**
 * Semantic Validator
 *
 * Validates semantic correctness beyond schema validation.
 * Ensures that IDs, references, and artifacts belong to the correct slice/stage context.
 */

import * as yaml from "js-yaml";
import * as fs from "fs";
import * as path from "path";

export interface SemanticValidationError {
  type: "scenario_id_mismatch" | "test_scenario_mismatch" | "code_artifact_mismatch" | "trace_link_invalid" | "gate_invalid";
  message: string;
  details?: any;
}

export interface SemanticValidationResult {
  valid: boolean;
  errors: SemanticValidationError[];
}

export interface ValidationContext {
  sliceId: string;
  stageId: string;
  contextId: string;
  serviceId?: string;
}

export class SemanticValidator {
  private root: string;

  constructor(root: string) {
    this.root = root;
  }

  /**
   * Validate execution result semantics
   */
  validateExecutionResult(
    context: ValidationContext,
    executionResult: any
  ): SemanticValidationResult {
    const errors: SemanticValidationError[] = [];

    // Validate scenario IDs
    if (executionResult.scenarios) {
      for (const scenario of executionResult.scenarios) {
        const scenarioErrors = this.validateScenarioId(context, scenario.id);
        errors.push(...scenarioErrors);
      }
    }

    // Validate test IDs and scenario alignment
    if (executionResult.tests) {
      for (const test of executionResult.tests) {
        const testErrors = this.validateTestId(context, test);
        errors.push(...testErrors);
      }
    }

    // Validate code artifact IDs
    if (executionResult.code) {
      for (const codeArtifact of executionResult.code) {
        const codeErrors = this.validateCodeArtifactId(context, codeArtifact.id);
        errors.push(...codeErrors);
      }
    }

    // Validate trace links
    if (executionResult.traceLinks) {
      for (const link of executionResult.traceLinks) {
        const linkErrors = this.validateTraceLink(context, link);
        errors.push(...linkErrors);
      }
    }

    // Validate gate updates
    if (executionResult.gateUpdates) {
      for (const gateUpdate of executionResult.gateUpdates) {
        const gateErrors = this.validateGateUpdate(context, gateUpdate);
        errors.push(...gateErrors);
      }
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate scenario ID belongs to current slice
   */
  private validateScenarioId(
    context: ValidationContext,
    scenarioId: string
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // Extract the core slice name (e.g., "payment" from "ordering-payment-v1")
    // Format: <context>-<slice>-<version>
    const sliceParts = context.sliceId.split("-");
    const coreSliceName = sliceParts.length >= 2 ? sliceParts[1] : context.sliceId;

    // Scenario ID should contain the core slice name
    // Example: "payment-process-payment" for ordering-payment-v1 slice
    if (!scenarioId.toLowerCase().includes(coreSliceName.toLowerCase())) {
      errors.push({
        type: "scenario_id_mismatch",
        message: `Scenario ID "${scenarioId}" does not belong to slice "${context.sliceId}"`,
        details: { scenarioId, sliceId: context.sliceId, coreSliceName }
      });
    }

    return errors;
  }

  /**
   * Validate test ID and scenario alignment
   */
  private validateTestId(
    context: ValidationContext,
    test: any
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // Test ID should align with scenario ID
    if (test.scenarioId && test.id) {
      // Extract base from scenario ID and check if test ID contains it
      const scenarioBase = test.scenarioId.split("-")[0];
      if (!test.id.toLowerCase().includes(scenarioBase.toLowerCase())) {
        errors.push({
          type: "test_scenario_mismatch",
          message: `Test ID "${test.id}" does not align with scenario "${test.scenarioId}"`,
          details: { testId: test.id, scenarioId: test.scenarioId }
        });
      }
    }

    return errors;
  }

  /**
   * Validate code artifact ID belongs to current slice/service
   */
  private validateCodeArtifactId(
    context: ValidationContext,
    codeArtifactId: string
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    // Extract the core slice name (e.g., "payment" from "ordering-payment-v1")
    const sliceParts = context.sliceId.split("-");
    const coreSliceName = sliceParts.length >= 2 ? sliceParts[1] : context.sliceId;

    const codeIdLower = codeArtifactId.toLowerCase();

    // Check if code artifact ID contains core slice name
    if (!codeIdLower.includes(coreSliceName.toLowerCase())) {
      // If service ID is available, check that too
      if (context.serviceId && !codeIdLower.includes(context.serviceId.toLowerCase())) {
        errors.push({
          type: "code_artifact_mismatch",
          message: `Code artifact ID "${codeArtifactId}" does not belong to slice "${context.sliceId}" or service "${context.serviceId}"`,
          details: { codeArtifactId, sliceId: context.sliceId, serviceId: context.serviceId, coreSliceName }
        });
      } else if (!context.serviceId) {
        errors.push({
          type: "code_artifact_mismatch",
          message: `Code artifact ID "${codeArtifactId}" does not belong to slice "${context.sliceId}"`,
          details: { codeArtifactId, sliceId: context.sliceId, coreSliceName }
        });
      }
    }

    return errors;
  }

  /**
   * Validate trace link references exist and belong to current slice
   */
  private validateTraceLink(
    context: ValidationContext,
    link: any
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    if (!link || typeof link !== "object") {
      errors.push({
        type: "trace_link_invalid",
        message: "Trace link must be an object",
        details: { link }
      });
      return errors;
    }

    if (typeof link.relation !== "string" || !link.relation.trim()) {
      errors.push({
        type: "trace_link_invalid",
        message: "Trace link relation must be a non-empty string",
        details: { relation: link.relation }
      });
    }

    errors.push(...this.validateTraceNode(context, link.from, "from"));
    errors.push(...this.validateTraceNode(context, link.to, "to"));

    return errors;
  }

  private validateTraceNode(
    context: ValidationContext,
    node: any,
    side: "from" | "to"
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    if (!node || typeof node !== "object") {
      errors.push({
        type: "trace_link_invalid",
        message: `Trace link '${side}' must be an object with type and id`,
        details: { side, node }
      });
      return errors;
    }

    if (typeof node.type !== "string" || !node.type.trim()) {
      errors.push({
        type: "trace_link_invalid",
        message: `Trace link '${side}.type' must be a non-empty string`,
        details: { side, type: node.type }
      });
    }

    if (typeof node.id !== "string" || !node.id.trim()) {
      errors.push({
        type: "trace_link_invalid",
        message: `Trace link '${side}.id' must be a non-empty string`,
        details: { side, id: node.id }
      });
      return errors;
    }

    if (!this.isTraceNodeInSlice(context, node.type, node.id)) {
      errors.push({
        type: "trace_link_invalid",
        message: `Trace link '${side}' artifact "${node.id}" does not belong to slice "${context.sliceId}"`,
        details: { side, type: node.type, id: node.id, sliceId: context.sliceId }
      });
    }

    if (node.identity && typeof node.identity === "object") {
      if (typeof node.identity.sliceId === "string" && node.identity.sliceId !== context.sliceId) {
        errors.push({
          type: "trace_link_invalid",
          message: `Trace link '${side}' identity slice "${node.identity.sliceId}" does not match "${context.sliceId}"`,
          details: { side, identitySliceId: node.identity.sliceId, sliceId: context.sliceId }
        });
      }
    }

    return errors;
  }

  private isTraceNodeInSlice(
    context: ValidationContext,
    nodeType: string,
    nodeId: string
  ): boolean {
    const normalizedType = nodeType.toLowerCase();

    // Only some trace node types encode slice ownership in their IDs.
    if (normalizedType === "slice") {
      return nodeId === context.sliceId;
    }

    if (normalizedType === "scenario" || normalizedType === "test" || normalizedType === "code") {
      return this.isArtifactInSlice(context, nodeId);
    }

    return true;
  }

  /**
   * Validate gate update is for a valid gate
   */
  private validateGateUpdate(
    context: ValidationContext,
    gateUpdate: any
  ): SemanticValidationError[] {
    const errors: SemanticValidationError[] = [];

    const validGates = [
      "requirements_ready",
      "design_ready",
      "behavior_ready",
      "test_ready",
      "implementation_ready",
      "verification_ready",
      "accepted"
    ];

    if (!validGates.includes(gateUpdate.gate)) {
      errors.push({
        type: "gate_invalid",
        message: `Invalid gate "${gateUpdate.gate}". Must be one of: ${validGates.join(", ")}`,
        details: { gate: gateUpdate.gate, validGates }
      });
    }

    return errors;
  }

  /**
   * Check if artifact ID belongs to current slice
   */
  private isArtifactInSlice(context: ValidationContext, artifactId: string): boolean {
    // Extract the core slice name (e.g., "payment" from "ordering-payment-v1")
    const sliceParts = context.sliceId.split("-");
    const coreSliceName = sliceParts.length >= 2 ? sliceParts[1] : context.sliceId;

    const artifactIdLower = artifactId.toLowerCase();
    const coreSliceNameLower = coreSliceName.toLowerCase();

    return artifactIdLower.includes(coreSliceNameLower);
  }

  /**
   * Validate slice file semantics
   */
  validateSliceFile(sliceFilePath: string): SemanticValidationResult {
    const errors: SemanticValidationError[] = [];

    try {
      const content = fs.readFileSync(sliceFilePath, "utf-8");
      const slice = yaml.load(content) as any;

      // Validate gates are valid
      if (slice.gates) {
        for (const gate of Object.keys(slice.gates)) {
          const validGates = [
            "requirements_ready",
            "design_ready",
            "behavior_ready",
            "test_ready",
            "implementation_ready",
            "verification_ready",
            "accepted"
          ];

          if (!validGates.includes(gate)) {
            errors.push({
              type: "gate_invalid",
              message: `Invalid gate "${gate}" in slice file`,
              details: { gate, validGates }
            });
          }
        }
      }

      // Validate lifecycle state is valid
      if (slice.lifecycle && slice.lifecycle.state) {
        const validStates = [
          "requirements-defined",
          "design-defined",
          "behavior-defined",
          "test-defined",
          "implementation-defined",
          "verification-defined",
          "accepted"
        ];

        if (!validStates.includes(slice.lifecycle.state)) {
          errors.push({
            type: "gate_invalid",
            message: `Invalid lifecycle state "${slice.lifecycle.state}"`,
            details: { state: slice.lifecycle.state, validStates }
          });
        }
      }

    } catch (error) {
      errors.push({
        type: "trace_link_invalid",
        message: `Failed to validate slice file: ${error}`,
        details: { error }
      });
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}
