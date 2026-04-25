/**
 * Artifact Identity Round-trip Test
 *
 * Verifies that identity conversions are stable and reversible:
 * - encode/decode round-trip
 * - fromPath -> toTraceRef -> fromTraceRef round-trip
 * - toCanonicalId uniqueness
 */

import {
  type ArtifactIdentity,
  encodeIdentity,
  decodeIdentity,
  fromPath,
  toTraceRef,
  fromTraceRef,
  toCanonicalId,
  identityEquals,
} from "../artifact-identity";

console.log("=== Artifact Identity Round-trip Test ===\n");

let passed = 0;
let failed = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error instanceof Error ? error.message : String(error)}`);
    failed++;
  }
}

// Test 1: encode/decode round-trip
test("encode/decode round-trip", () => {
  const original: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
    logicalName: "design.md",
  };

  const encoded = encodeIdentity(original);
  const decoded = decodeIdentity(encoded);

  if (!identityEquals(original, decoded)) {
    throw new Error(`Round-trip failed: ${JSON.stringify(original)} != ${JSON.stringify(decoded)}`);
  }

  if (original.logicalName !== decoded.logicalName) {
    throw new Error(`Logical name lost: ${original.logicalName} != ${decoded.logicalName}`);
  }
});

// Test 2: encode/decode without logicalName
test("encode/decode without logicalName", () => {
  const original: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
  };

  const encoded = encodeIdentity(original);
  const decoded = decodeIdentity(encoded);

  if (!identityEquals(original, decoded)) {
    throw new Error(`Round-trip failed: ${JSON.stringify(original)} != ${JSON.stringify(decoded)}`);
  }
});

// Test 3: fromPath extracts correct identity
test("fromPath extracts correct identity", () => {
  const path = "contexts/ordering/slices/ordering-payment-v1/design.md";
  const identity = fromPath(path, "design");

  if (identity.sliceId !== "ordering-payment-v1") {
    throw new Error(`Wrong sliceId: ${identity.sliceId}`);
  }

  if (identity.artifactType !== "design") {
    throw new Error(`Wrong artifactType: ${identity.artifactType}`);
  }

  if (identity.artifactId !== "design") {
    throw new Error(`Wrong artifactId: ${identity.artifactId}`);
  }

  if (identity.logicalName !== "design.md") {
    throw new Error(`Wrong logicalName: ${identity.logicalName}`);
  }
});

// Test 4: toTraceRef/fromTraceRef round-trip
test("toTraceRef/fromTraceRef round-trip", () => {
  const original: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
  };

  const traceRef = toTraceRef(original);
  const partial = fromTraceRef(traceRef);

  if (partial.artifactType !== original.artifactType) {
    throw new Error(`artifactType mismatch: ${partial.artifactType} != ${original.artifactType}`);
  }

  if (partial.artifactId !== original.artifactId) {
    throw new Error(`artifactId mismatch: ${partial.artifactId} != ${original.artifactId}`);
  }
});

// Test 5: toCanonicalId uniqueness
test("toCanonicalId uniqueness", () => {
  const id1: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
  };

  const id2: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
    logicalName: "design.md",
  };

  const id3: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "behavior",
    artifactType: "design",
    artifactId: "design",
  };

  const canonical1 = toCanonicalId(id1);
  const canonical2 = toCanonicalId(id2);
  const canonical3 = toCanonicalId(id3);

  // Same identity (ignoring logicalName) should produce same canonical ID
  if (canonical1 !== canonical2) {
    throw new Error(`Canonical IDs should match: ${canonical1} != ${canonical2}`);
  }

  // Different stageId should produce different canonical ID
  if (canonical1 === canonical3) {
    throw new Error(`Canonical IDs should differ: ${canonical1} == ${canonical3}`);
  }
});

// Test 6: fromPath handles different file types
test("fromPath handles different file types", () => {
  const testCases = [
    { path: "contexts/ordering/slices/ordering-payment-v1/requirements.md", expectedType: "requirements", expectedId: "requirements" },
    { path: "contexts/ordering/slices/ordering-payment-v1/behaviors.feature", expectedType: "behavior", expectedId: "behaviors" },
    { path: "contexts/ordering/slices/ordering-payment-v1/payment.test.ts", expectedType: "test", expectedId: "payment" },
    { path: "contexts/ordering/slices/ordering-payment-v1/payment-service.ts", expectedType: "code", expectedId: "payment-service" },
    { path: "contexts/ordering/slices/ordering-payment-v1/trace.yaml", expectedType: "trace", expectedId: "trace" },
  ];

  for (const testCase of testCases) {
    const identity = fromPath(testCase.path, "test");
    if (identity.artifactType !== testCase.expectedType) {
      throw new Error(`Wrong type for ${testCase.path}: ${identity.artifactType} != ${testCase.expectedType}`);
    }
    if (identity.artifactId !== testCase.expectedId) {
      throw new Error(`Wrong id for ${testCase.path}: ${identity.artifactId} != ${testCase.expectedId}`);
    }
  }
});

// Test 7: identityEquals works correctly
test("identityEquals works correctly", () => {
  const id1: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
  };

  const id2: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "design",
    artifactType: "design",
    artifactId: "design",
    logicalName: "design.md",
  };

  const id3: ArtifactIdentity = {
    sliceId: "ordering-payment-v1",
    stageId: "behavior",
    artifactType: "design",
    artifactId: "design",
  };

  if (!identityEquals(id1, id2)) {
    throw new Error("identityEquals should ignore logicalName");
  }

  if (identityEquals(id1, id3)) {
    throw new Error("identityEquals should detect stageId difference");
  }
});

// Test 8: Windows path round-trip
test("Windows path round-trip", () => {
  const windowsPath = "contexts\\ordering\\slices\\ordering-payment-v1\\design.md";
  const identity = fromPath(windowsPath, "design");

  if (identity.sliceId !== "ordering-payment-v1") {
    throw new Error(`Wrong sliceId from Windows path: ${identity.sliceId}`);
  }

  if (identity.artifactType !== "design") {
    throw new Error(`Wrong artifactType from Windows path: ${identity.artifactType}`);
  }

  if (identity.artifactId !== "design") {
    throw new Error(`Wrong artifactId from Windows path: ${identity.artifactId}`);
  }

  if (identity.logicalName !== "design.md") {
    throw new Error(`Wrong logicalName from Windows path: ${identity.logicalName}`);
  }
});

// Test 9: Mixed path separators
test("Mixed path separators", () => {
  const mixedPath = "contexts/ordering\\slices/ordering-payment-v1\\behaviors.feature";
  const identity = fromPath(mixedPath, "behavior");

  if (identity.sliceId !== "ordering-payment-v1") {
    throw new Error(`Wrong sliceId from mixed path: ${identity.sliceId}`);
  }

  if (identity.artifactType !== "behavior") {
    throw new Error(`Wrong artifactType from mixed path: ${identity.artifactType}`);
  }

  if (identity.logicalName !== "behaviors.feature") {
    throw new Error(`Wrong logicalName from mixed path: ${identity.logicalName}`);
  }
});

console.log("\n=== Test Summary ===\n");
console.log(`Total: ${passed + failed} tests`);
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}\n`);

if (failed > 0) {
  console.log("✗ Some tests failed!");
  process.exit(1);
} else {
  console.log("✓ All tests passed!");
  process.exit(0);
}
