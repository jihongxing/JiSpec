/**
 * Semantic Validation Negative Test
 *
 * Verifies that semantic validator catches "false positive" errors:
 * - Scenario IDs that don't belong to the slice
 * - Code artifact IDs that reference wrong services
 * - Invalid gate names
 */

import { SemanticValidator } from "../semantic-validator";

interface TestResult {
  passed: boolean;
  message: string;
  details?: string;
}

class SemanticValidationNegativeTest {
  private validator: SemanticValidator;

  constructor(root: string) {
    this.validator = new SemanticValidator(root);
  }

  async run(): Promise<void> {
    console.log("\n=== Semantic Validation Negative Test ===\n");

    const results: TestResult[] = [];

    try {
      // Test 1: Scenario ID mismatch
      console.log("[Test 1] Scenario ID mismatch detection...");
      const scenarioMismatchResult = this.validator.validateExecutionResult(
        {
          sliceId: "ordering-payment-v1",
          stageId: "behavior",
          contextId: "ordering",
          serviceId: "payment-service"
        },
        {
          scenarios: [
            { id: "checkout-process-checkout" } // Wrong! Should be payment-*
          ],
          tests: [],
          code: [],
          traceLinks: [],
          gateUpdates: []
        }
      );

      if (!scenarioMismatchResult.valid && scenarioMismatchResult.errors.length > 0) {
        const error = scenarioMismatchResult.errors[0];
        if (error.type === "scenario_id_mismatch") {
          results.push({
            passed: true,
            message: "Scenario ID mismatch detected",
            details: error.message
          });
        } else {
          results.push({
            passed: false,
            message: "Wrong error type for scenario mismatch",
            details: `Expected scenario_id_mismatch, got ${error.type}`
          });
        }
      } else {
        results.push({
          passed: false,
          message: "Failed to detect scenario ID mismatch"
        });
      }

      // Test 2: Code artifact ID mismatch
      console.log("\n[Test 2] Code artifact ID mismatch detection...");
      const codeArtifactMismatchResult = this.validator.validateExecutionResult(
        {
          sliceId: "ordering-payment-v1",
          stageId: "implementation",
          contextId: "ordering",
          serviceId: "payment-service"
        },
        {
          scenarios: [],
          tests: [],
          code: [
            { id: "checkout-service" } // Wrong! Should be payment-*
          ],
          traceLinks: [],
          gateUpdates: []
        }
      );

      if (!codeArtifactMismatchResult.valid && codeArtifactMismatchResult.errors.length > 0) {
        const error = codeArtifactMismatchResult.errors[0];
        if (error.type === "code_artifact_mismatch") {
          results.push({
            passed: true,
            message: "Code artifact ID mismatch detected",
            details: error.message
          });
        } else {
          results.push({
            passed: false,
            message: "Wrong error type for code artifact mismatch",
            details: `Expected code_artifact_mismatch, got ${error.type}`
          });
        }
      } else {
        results.push({
          passed: false,
          message: "Failed to detect code artifact ID mismatch"
        });
      }

      // Test 3: Invalid gate name
      console.log("\n[Test 3] Invalid gate name detection...");
      const invalidGateResult = this.validator.validateExecutionResult(
        {
          sliceId: "ordering-payment-v1",
          stageId: "design",
          contextId: "ordering"
        },
        {
          scenarios: [],
          tests: [],
          code: [],
          traceLinks: [],
          gateUpdates: [
            { gate: "invalid_gate_name", passed: true } // Wrong! Not a valid gate
          ]
        }
      );

      if (!invalidGateResult.valid && invalidGateResult.errors.length > 0) {
        const error = invalidGateResult.errors[0];
        if (error.type === "gate_invalid") {
          results.push({
            passed: true,
            message: "Invalid gate name detected",
            details: error.message
          });
        } else {
          results.push({
            passed: false,
            message: "Wrong error type for invalid gate",
            details: `Expected gate_invalid, got ${error.type}`
          });
        }
      } else {
        results.push({
          passed: false,
          message: "Failed to detect invalid gate name"
        });
      }

      // Test 4: Trace link with wrong slice reference
      console.log("\n[Test 4] Trace link with wrong slice reference detection...");
      const traceLinkMismatchResult = this.validator.validateExecutionResult(
        {
          sliceId: "ordering-payment-v1",
          stageId: "test",
          contextId: "ordering"
        },
        {
          scenarios: [],
          tests: [],
          code: [],
          traceLinks: [
            {
              from: {
                type: "scenario",
                id: "checkout-scenario-1" // Wrong! Should be payment-*
              },
              to: {
                type: "test",
                id: "payment-test-1"
              },
              relation: "tests"
            }
          ],
          gateUpdates: []
        }
      );

      if (!traceLinkMismatchResult.valid && traceLinkMismatchResult.errors.length > 0) {
        const error = traceLinkMismatchResult.errors[0];
        if (error.type === "trace_link_invalid") {
          results.push({
            passed: true,
            message: "Trace link mismatch detected",
            details: error.message
          });
        } else {
          results.push({
            passed: false,
            message: "Wrong error type for trace link mismatch",
            details: `Expected trace_link_invalid, got ${error.type}`
          });
        }
      } else {
        results.push({
          passed: false,
          message: "Failed to detect trace link mismatch"
        });
      }

      // Test 5: Valid execution result should pass
      console.log("\n[Test 5] Valid execution result should pass...");
      const validResult = this.validator.validateExecutionResult(
        {
          sliceId: "ordering-payment-v1",
          stageId: "behavior",
          contextId: "ordering",
          serviceId: "payment-service"
        },
        {
          scenarios: [
            { id: "payment-process-payment" } // Correct!
          ],
          tests: [],
          code: [],
          traceLinks: [
            {
              from: {
                type: "scenario",
                id: "payment-process-payment"
              },
              to: {
                type: "test",
                id: "payment-test-1"
              },
              relation: "tests"
            }
          ],
          gateUpdates: [
            { gate: "behavior_ready", passed: true } // Correct!
          ]
        }
      );

      if (validResult.valid && validResult.errors.length === 0) {
        results.push({
          passed: true,
          message: "Valid execution result passed validation"
        });
      } else {
        results.push({
          passed: false,
          message: "Valid execution result failed validation",
          details: validResult.errors.map(e => e.message).join("; ")
        });
      }

      // Print summary
      this.printSummary(results);

    } catch (error) {
      console.error("\n=== Test Summary ===\n");
      console.error(`✗ ${error}`);
      console.error("\nTotal: 1 tests");
      console.error("Passed: 0");
      console.error("Failed: 1");
      console.error("\n✗ Some tests failed!\n");
      process.exit(1);
    }
  }

  private printSummary(results: TestResult[]): void {
    console.log("\n=== Test Summary ===\n");

    for (const result of results) {
      if (result.passed) {
        console.log(`✓ ${result.message}`);
        if (result.details) {
          console.log(`  ${result.details}`);
        }
      } else {
        console.log(`✗ ${result.message}`);
        if (result.details) {
          console.log(`  ${result.details}`);
        }
      }
    }

    const passed = results.filter(r => r.passed).length;
    const failed = results.filter(r => !r.passed).length;

    console.log(`\nTotal: ${results.length} tests`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);

    if (failed > 0) {
      console.log("\n✗ Some tests failed!\n");
      process.exit(1);
    } else {
      console.log("\n✓ All tests passed!\n");
    }
  }
}

// Run the test
const test = new SemanticValidationNegativeTest(process.cwd());
test.run().catch(error => {
  console.error("Test execution failed:", error);
  process.exit(1);
});
