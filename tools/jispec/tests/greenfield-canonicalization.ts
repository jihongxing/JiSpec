import assert from "node:assert/strict";
import { canonicalizeToJson, type CanonicalSchema } from "../greenfield/canonicalization";

interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
}

function main(): void {
  console.log("=== Greenfield Canonicalization Tests ===\n");

  const results: TestResult[] = [];

  results.push(record("canonicalizer recursively sorts object keys", () => {
    const schema: CanonicalSchema = {
      kind: "object",
      properties: {
        zeta: { kind: "string" },
        alpha: {
          kind: "object",
          properties: {
            beta: { kind: "number" },
            gamma: { kind: "string" },
          },
          required: ["beta", "gamma"],
        },
      },
      required: ["alpha", "zeta"],
    };

    const actual = canonicalizeToJson({
      zeta: "top",
      alpha: { gamma: "inside", beta: 1 },
    }, schema);

    assert.equal(actual, `{"alpha":{"beta":1,"gamma":"inside"},"zeta":"top"}`);
  }));

  results.push(record("canonicalizer sorts set arrays by declared sort key", () => {
    const schema: CanonicalSchema = {
      kind: "object",
      properties: {
        items: {
          kind: "array",
          arrayKind: "set",
          sortBy: "id",
          items: {
            kind: "object",
            properties: {
              id: { kind: "string" },
              label: { kind: "string" },
            },
            required: ["id", "label"],
          },
        },
      },
      required: ["items"],
    };

    const actual = canonicalizeToJson({
      items: [
        { id: "b", label: "Bee" },
        { id: "a", label: "Aye" },
      ],
    }, schema);

    assert.equal(actual, `{"items":[{"id":"a","label":"Aye"},{"id":"b","label":"Bee"}]}`);
  }));

  results.push(record("canonicalizer preserves list arrays in input order", () => {
    const schema: CanonicalSchema = {
      kind: "object",
      properties: {
        steps: {
          kind: "array",
          arrayKind: "list",
          items: {
            kind: "object",
            properties: {
              name: { kind: "string" },
              index: { kind: "number" },
            },
            required: ["name", "index"],
          },
        },
      },
      required: ["steps"],
    };

    const actual = canonicalizeToJson({
      steps: [
        { name: "second", index: 2 },
        { name: "first", index: 1 },
      ],
    }, schema);

    assert.equal(actual, `{"steps":[{"index":2,"name":"second"},{"index":1,"name":"first"}]}`);
  }));

  results.push(record("canonicalizer sorts timeline arrays by declared time key", () => {
    const schema: CanonicalSchema = {
      kind: "object",
      properties: {
        events: {
          kind: "array",
          arrayKind: "timeline",
          sortBy: "timestamp",
          items: {
            kind: "object",
            properties: {
              timestamp: { kind: "string" },
              kind: { kind: "string" },
            },
            required: ["timestamp", "kind"],
          },
        },
      },
      required: ["events"],
    };

    const actual = canonicalizeToJson({
      events: [
        { timestamp: "2026-05-10T10:00:00.000Z", kind: "later" },
        { timestamp: "2026-05-10T09:00:00.000Z", kind: "earlier" },
      ],
    }, schema);

    assert.equal(actual, `{"events":[{"kind":"earlier","timestamp":"2026-05-10T09:00:00.000Z"},{"kind":"later","timestamp":"2026-05-10T10:00:00.000Z"}]}`);
  }));

  results.push(record("canonicalizer fails fast on unknown keys and unsupported array declarations", () => {
    assert.throws(() => canonicalizeToJson({
      known: "ok",
      extra: "nope",
    }, {
      kind: "object",
      properties: {
        known: { kind: "string" },
      },
      required: ["known"],
    }), /Unexpected key: extra/);

    assert.throws(() => canonicalizeToJson({
      values: [1, 2, 3],
    }, {
      kind: "object",
      properties: {
        values: {
          kind: "array",
          arrayKind: "timeline",
          items: { kind: "number" },
        },
      },
      required: ["values"],
    }), /timeline arrays must declare sortBy/);
  }));

  results.push(record("canonicalizer normalizes strings to NFC and numbers to canonical decimal literals", () => {
    const schema: CanonicalSchema = {
      kind: "object",
      properties: {
        label: { kind: "string" },
        count: { kind: "number" },
        tiny: { kind: "number" },
        zero: { kind: "number" },
      },
      required: ["label", "count", "tiny", "zero"],
    };

    const actual = canonicalizeToJson({
      label: "e\u0301",
      count: 1e21,
      tiny: 0.000001,
      zero: -0,
    }, schema);

    assert.equal(actual, `{"count":1000000000000000000000,"label":"é","tiny":0.000001,"zero":0}`);
  }));

  printResults(results);
}

function record(name: string, fn: () => void): TestResult {
  try {
    fn();
    return { name, passed: true };
  } catch (error) {
    return {
      name,
      passed: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function printResults(results: TestResult[]): void {
  let passed = 0;
  let failed = 0;

  for (const result of results) {
    if (result.passed) {
      console.log(`✓ ${result.name}`);
      passed++;
    } else {
      console.log(`✗ ${result.name}`);
      console.log(`  Error: ${result.error ?? "unknown error"}`);
      failed++;
    }
  }

  console.log(`\n${passed}/${results.length} tests passed`);

  if (failed > 0) {
    process.exit(1);
  }
}

main();
