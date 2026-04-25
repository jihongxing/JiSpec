import { createDirectoryIdentity } from "../artifact-identity";
import { MockProvider } from "../providers/mock-provider";

console.log("=== Provider Identity Semantics Test ===\n");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => Promise<void> | void) {
  return Promise.resolve()
    .then(fn)
    .then(() => {
      console.log(`✓ ${name}`);
      passed++;
    })
    .catch((error) => {
      console.error(`✗ ${name}`);
      console.error(`  ${error instanceof Error ? error.message : String(error)}`);
      failed++;
    });
}

async function main() {
  await test("createDirectoryIdentity generates stable src identity", () => {
    const identityA = createDirectoryIdentity("src/", "ordering-payment-v1", "implementing");
    const identityB = createDirectoryIdentity("src\\", "ordering-payment-v1", "implementing");

    if (identityA.sliceId !== "ordering-payment-v1") {
      throw new Error(`Wrong sliceId: ${identityA.sliceId}`);
    }

    if (identityA.stageId !== "implementing") {
      throw new Error(`Wrong stageId: ${identityA.stageId}`);
    }

    if (identityA.artifactType !== "code") {
      throw new Error(`Wrong artifactType: ${identityA.artifactType}`);
    }

    if (identityA.artifactId !== "src" || identityA.logicalName !== "src") {
      throw new Error(`Unexpected directory identity: ${JSON.stringify(identityA)}`);
    }

    if (JSON.stringify(identityA) !== JSON.stringify(identityB)) {
      throw new Error("Directory identity should be separator-agnostic");
    }
  });

  await test("mock provider emits directory identities via createDirectoryIdentity", async () => {
    const provider = new MockProvider();
    const prompt = `- Slice ID: ordering-payment-v1
- Stage: implementing
## Output Files (Your Task)
You must generate or update these files:
- contexts/ordering/slices/ordering-payment-v1/src/
`;

    const raw = await provider.generate(prompt);
    const output = JSON.parse(raw) as {
      writeOperations?: Array<{ type: string; path: string; identity?: { artifactId?: string; logicalName?: string } }>;
    };

    const directoryOp = output.writeOperations?.find((item) => item.type === "directory");
    if (!directoryOp) {
      throw new Error("Expected one directory write operation");
    }

    if (directoryOp.identity?.artifactId !== "src") {
      throw new Error(`Wrong directory artifactId: ${directoryOp.identity?.artifactId}`);
    }

    if (directoryOp.identity?.logicalName !== "src") {
      throw new Error(`Wrong directory logicalName: ${directoryOp.identity?.logicalName}`);
    }
  });

  await test("mock provider trace links do not carry carrier artifact identities", async () => {
    const provider = new MockProvider();
    const prompt = `- Slice ID: ordering-payment-v1
- Stage: test
## Output Files (Your Task)
You must generate or update these files:
- contexts/ordering/slices/ordering-payment-v1/requirements.md
- contexts/ordering/slices/ordering-payment-v1/behaviors.feature
- contexts/ordering/slices/ordering-payment-v1/test-spec.yaml

Scenario: Successful payment
`;

    const raw = await provider.generate(prompt);
    const output = JSON.parse(raw) as {
      traceLinks?: Array<{ from?: Record<string, unknown>; to?: Record<string, unknown> }>;
    };

    if (!output.traceLinks || output.traceLinks.length === 0) {
      throw new Error("Expected trace links to be generated");
    }

    for (const link of output.traceLinks) {
      if ("identity" in (link.from || {})) {
        throw new Error("Trace link `from` should not carry identity");
      }
      if ("identity" in (link.to || {})) {
        throw new Error("Trace link `to` should not carry identity");
      }
    }
  });

  console.log("\n=== Test Summary ===\n");
  console.log(`Total: ${passed + failed} tests`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}\n`);

  if (failed > 0) {
    console.log("✗ Some tests failed!");
    process.exit(1);
  }

  console.log("✓ All tests passed!");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
