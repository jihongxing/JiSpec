import type { AIProvider, GenerateOptions } from "../ai-provider";

/**
 * Mock AI Provider for testing
 * Returns structured JSON output without calling external AI
 */
export class MockProvider implements AIProvider {
  name = "mock";

  async generate(prompt: string, options?: GenerateOptions): Promise<string> {
    // Parse prompt to extract output file paths
    const outputSection = prompt.match(/## Output Files \(Your Task\)\s+You must generate or update these files:\s+((?:- .+\n?)+)/);
    const outputFiles: string[] = [];

    if (outputSection) {
      const lines = outputSection[1].trim().split('\n');
      for (const line of lines) {
        const match = line.match(/^- (.+)$/);
        if (match) {
          outputFiles.push(match[1]);
        }
      }
    }

    // Extract slice ID
    const sliceIdMatch = prompt.match(/- Slice ID: (.+)/);
    const sliceId = sliceIdMatch ? sliceIdMatch[1] : "unknown";

    // Extract existing requirement IDs from prompt
    const reqMatches = prompt.match(/REQ-[A-Z]+-\d+/g) || [];
    const existingReqs = [...new Set(reqMatches)];

    // Extract existing scenario IDs from prompt (look for Scenario: lines in behaviors.feature)
    const scenarioLines = prompt.match(/Scenario: (.+)/g) || [];
    const existingScenarios: string[] = [];

    // Generate scenario IDs from scenario titles
    for (const line of scenarioLines) {
      const title = line.replace('Scenario: ', '').trim();
      // Convert "Successful checkout creates an order" -> "SCN-ORDER-CHECKOUT-VALID"
      // Convert "Checkout rejects an unavailable item" -> "SCN-ORDER-CHECKOUT-OUT-OF-STOCK"
      const scnId = title.toLowerCase().includes('reject') || title.toLowerCase().includes('unavailable')
        ? 'SCN-ORDER-CHECKOUT-OUT-OF-STOCK'
        : 'SCN-ORDER-CHECKOUT-VALID';
      if (!existingScenarios.includes(scnId)) {
        existingScenarios.push(scnId);
      }
    }

    // Infer artifact type and gate from output file
    const inferArtifactType = (fileName: string): string => {
      const mapping: Record<string, string> = {
        "requirements.md": "requirement",
        "invariants.md": "invariant",
        "behaviors.feature": "scenario",
        "test-spec.yaml": "test",
        "design.md": "design",
      };
      const baseName = fileName.split('/').pop() || fileName;
      return mapping[baseName] || "artifact";
    };

    const inferGate = (fileName: string): string | null => {
      const mapping: Record<string, string> = {
        "requirements.md": "requirements_ready",
        "design.md": "design_ready",
        "behaviors.feature": "behavior_ready",
        "test-spec.yaml": "test_ready",
        "evidence.md": "verification_ready",
      };

      const baseName = fileName.split('/').pop() || fileName;

      // Check if it's a directory (ends with / or is just "src")
      if (fileName.endsWith('/') || fileName === 'src') {
        return "implementation_ready";
      }

      return mapping[baseName] || null;
    };

    // Generate content based on file type
    const generateContent = (file: string): string => {
      const baseName = file.split('/').pop() || file;

      if (baseName === "requirements.md") {
        // Generate requirements.md with proper requirement IDs
        const reqId = `REQ-${sliceId.toUpperCase().replace(/-/g, '-')}-001`;
        return `# Requirements for ${sliceId}

## Functional Requirements

### ${reqId}: Core Functionality
The system shall provide the core functionality for ${sliceId}.

**Acceptance Criteria:**
- AC1: System accepts valid inputs
- AC2: System produces expected outputs
- AC3: System handles error cases gracefully

**Priority:** High
**Status:** Draft
`;
      }

      if (baseName === "design.md") {
        // Generate design.md
        return `# Design for ${sliceId}

## Architecture Overview
This slice implements the core functionality using a service-oriented architecture.

## Components
- **Service Layer**: Handles business logic
- **Data Layer**: Manages persistence
- **API Layer**: Exposes endpoints

## Data Flow
1. Request received at API layer
2. Service layer processes request
3. Data layer persists changes
4. Response returned to client

## Technology Stack
- TypeScript
- Node.js
- Express
`;
      }

      if (baseName === "behaviors.feature") {
        // Generate behaviors.feature with proper scenario IDs
        const scnId1 = `SCN-${sliceId.toUpperCase().replace(/-/g, '-')}-VALID`;
        const scnId2 = `SCN-${sliceId.toUpperCase().replace(/-/g, '-')}-INVALID`;
        return `Feature: ${sliceId}

  Scenario: ${scnId1} - Valid operation
    Given a valid input
    When the operation is performed
    Then the result is successful

  Scenario: ${scnId2} - Invalid operation
    Given an invalid input
    When the operation is performed
    Then an error is returned
`;
      }

      if (baseName === "test-spec.yaml") {
        // Generate valid test-spec.yaml
        const tests = existingScenarios.map((scnId, idx) => {
          const testId = `TEST-${scnId.replace('SCN-', '')}-INTEGRATION`;
          return {
            id: testId,
            type: "integration",
            verifies: [scnId],
            target: "checkout-service"
          };
        });

        return `tests:\n${tests.map(t =>
          `  - id: ${t.id}\n    type: ${t.type}\n    verifies:\n      - ${t.verifies[0]}\n    target: ${t.target}`
        ).join('\n')}`;
      }

      return `# Mock output for ${file}\n\nGenerated by MockProvider for slice: ${sliceId}\n`;
    };

    // Separate files and directories
    const files = outputFiles.filter(f => !f.endsWith('/') && f !== 'src');
    const directories = outputFiles.filter(f => f.endsWith('/') || f === 'src');

    // Generate writes for files
    const writes = files.map(file => ({
      path: file,
      content: generateContent(file),
      encoding: "utf-8"
    }));

    // For src directory, also generate a sample implementation file
    if (directories.some(d => d === 'src' || d.endsWith('src/'))) {
      const srcDir = directories.find(d => d === 'src' || d.endsWith('src/'));
      const srcPath = srcDir === 'src' ? 'src/' : srcDir;
      writes.push({
        path: `${srcPath}checkout-service.ts`,
        content: `// Mock implementation for ${sliceId}\n\nexport class CheckoutService {\n  async checkout(cartId: string): Promise<string> {\n    // Mock implementation\n    return "order-123";\n  }\n}\n`,
        encoding: "utf-8"
      });
    }

    // Generate writeOperations for directories
    const writeOperations = directories.map(dir => ({
      type: "directory" as const,
      path: dir.endsWith('/') ? dir : `${dir}/`,
    }));

    // Generate trace links for outputs
    const traceLinks = outputFiles.flatMap(file => {
      const baseName = file.split('/').pop() || file;
      const artifactType = inferArtifactType(baseName);

      if (baseName === "requirements.md") {
        // Generate trace link for requirements.md
        const reqId = `REQ-${sliceId.toUpperCase().replace(/-/g, '-')}-001`;
        return [{
          from: { type: "requirement", id: reqId },
          to: { type: "requirement", id: "requirements.md" },
          relation: "defined_in"
        }];
      }

      if (baseName === "design.md") {
        // Generate trace link for design.md
        const reqId = `REQ-${sliceId.toUpperCase().replace(/-/g, '-')}-001`;
        return [{
          from: { type: "requirement", id: reqId },
          to: { type: "design", id: "design.md" },
          relation: "designed_by"
        }];
      }

      if (baseName === "behaviors.feature") {
        // Generate trace links for scenarios
        const reqId = `REQ-${sliceId.toUpperCase().replace(/-/g, '-')}-001`;
        const scnId1 = `SCN-${sliceId.toUpperCase().replace(/-/g, '-')}-VALID`;
        const scnId2 = `SCN-${sliceId.toUpperCase().replace(/-/g, '-')}-INVALID`;
        return [
          {
            from: { type: "requirement", id: reqId },
            to: { type: "scenario", id: scnId1 },
            relation: "verified_by"
          },
          {
            from: { type: "requirement", id: reqId },
            to: { type: "scenario", id: scnId2 },
            relation: "verified_by"
          },
          {
            from: { type: "scenario", id: scnId1 },
            to: { type: "scenario", id: "behaviors.feature" },
            relation: "defined_in"
          },
          {
            from: { type: "scenario", id: scnId2 },
            to: { type: "scenario", id: "behaviors.feature" },
            relation: "defined_in"
          }
        ];
      }

      if (baseName === "test-spec.yaml" && existingScenarios.length > 0) {
        // Generate trace links from scenarios to tests
        return existingScenarios.map(scnId => {
          const testId = `TEST-${scnId.replace('SCN-', '')}-INTEGRATION`;
          return {
            from: { type: "scenario", id: scnId },
            to: { type: "test", id: testId },
            relation: "covered_by"
          };
        });
      }

      // For src directory, generate trace links from tests to code
      if (file === 'src' || file.endsWith('src/')) {
        if (existingScenarios.length > 0) {
          return existingScenarios.map(scnId => {
            const testId = `TEST-${scnId.replace('SCN-', '')}-INTEGRATION`;
            return {
              from: { type: "test", id: testId },
              to: { type: "code", id: "src/checkout-service" },
              relation: "implemented_by"
            };
          });
        }
      }

      return [];
    });

    // Generate gate updates for outputs (only for known gates)
    const gateUpdates = outputFiles
      .map(file => {
        const gate = inferGate(file);
        if (!gate) return null;
        return {
          gate,
          passed: true,
          reason: "Mock provider auto-pass"
        };
      })
      .filter((update): update is { gate: string; passed: boolean; reason: string } => update !== null);

    // Generate structured output
    const output = {
      success: true,
      writes,
      writeOperations,
      gateUpdates,
      traceLinks,
      evidence: [
        {
          type: "agent_execution",
          content: JSON.stringify({ provider: "mock", sliceId }),
          timestamp: new Date().toISOString()
        }
      ]
    };

    return JSON.stringify(output, null, 2);
  }

  async isAvailable(): Promise<boolean> {
    return true;
  }
}
