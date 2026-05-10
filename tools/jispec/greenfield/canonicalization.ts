export type CanonicalPrimitive = string | number | boolean | null;
export interface CanonicalObject {
  [key: string]: CanonicalValue;
}

export interface CanonicalArray extends Array<CanonicalValue> {}

export type CanonicalValue = CanonicalPrimitive | CanonicalObject | CanonicalArray;

export type CanonicalArrayKind = "set" | "list" | "timeline";
export type CanonicalStringNormalization = "nfc" | "none";

export interface CanonicalStringSchema {
  kind: "string";
  normalize?: CanonicalStringNormalization;
}

export interface CanonicalNumberSchema {
  kind: "number";
}

export interface CanonicalBooleanSchema {
  kind: "boolean";
}

export interface CanonicalNullSchema {
  kind: "null";
}

export interface CanonicalObjectSchema {
  kind: "object";
  properties: Record<string, CanonicalSchema>;
  required?: string[];
  additionalProperties?: false | CanonicalSchema;
}

export interface CanonicalArraySchema {
  kind: "array";
  arrayKind: CanonicalArrayKind;
  items: CanonicalSchema;
  sortBy?: string;
}

export type CanonicalSchema =
  | CanonicalStringSchema
  | CanonicalNumberSchema
  | CanonicalBooleanSchema
  | CanonicalNullSchema
  | CanonicalObjectSchema
  | CanonicalArraySchema;

export function canonicalizeWithSchema(value: unknown, schema: CanonicalSchema): CanonicalValue {
  switch (schema.kind) {
    case "string":
      if (typeof value !== "string") {
        throw new Error(`Expected string, received ${describeValueType(value)}.`);
      }
      return normalizeString(value, schema.normalize ?? "nfc");
    case "number":
      if (typeof value !== "number" || !Number.isFinite(value)) {
        throw new Error(`Expected finite number, received ${describeValueType(value)}.`);
      }
      return Object.is(value, -0) ? 0 : value;
    case "boolean":
      if (typeof value !== "boolean") {
        throw new Error(`Expected boolean, received ${describeValueType(value)}.`);
      }
      return value;
    case "null":
      if (value !== null) {
        throw new Error(`Expected null, received ${describeValueType(value)}.`);
      }
      return null;
    case "object":
      return canonicalizeObject(value, schema);
    case "array":
      return canonicalizeArray(value, schema);
  }
}

export function canonicalizeToJson(value: unknown, schema: CanonicalSchema): string {
  return serializeCanonicalValue(canonicalizeWithSchema(value, schema));
}

function canonicalizeObject(value: unknown, schema: CanonicalObjectSchema): Record<string, CanonicalValue> {
  if (!isRecord(value)) {
    throw new Error(`Expected object, received ${describeValueType(value)}.`);
  }

  const required = new Set(schema.required ?? []);
  const entries: Array<[string, CanonicalValue]> = [];
  const seen = new Set<string>();
  const keys = Object.keys(value).sort(compareText);

  for (const key of keys) {
    const propertySchema = schema.properties[key];
    const propertyValue = value[key];
    if (propertySchema) {
      entries.push([key, canonicalizeWithSchema(propertyValue, propertySchema)]);
      seen.add(key);
      continue;
    }

    if (schema.additionalProperties === false || schema.additionalProperties === undefined) {
      throw new Error(`Unexpected key: ${key}.`);
    }

    entries.push([key, canonicalizeWithSchema(propertyValue, schema.additionalProperties)]);
    seen.add(key);
  }

  for (const key of Object.keys(schema.properties).sort(compareText)) {
    if (!seen.has(key) && schema.required?.includes(key)) {
      throw new Error(`Missing required key: ${key}.`);
    }
  }

  return Object.fromEntries(entries);
}

function canonicalizeArray(value: unknown, schema: CanonicalArraySchema): CanonicalValue[] {
  if (!Array.isArray(value)) {
    throw new Error(`Expected array, received ${describeValueType(value)}.`);
  }

  const decorated = value.map((item, index) => {
    const canonicalItem = canonicalizeWithSchema(item, schema.items);
    return {
      index,
      canonicalItem,
      sortToken: sortTokenForArrayItem(canonicalItem, schema),
    };
  });

  if (schema.arrayKind === "list") {
    return decorated.map((entry) => entry.canonicalItem);
  }

  decorated.sort((left, right) => {
    const tokenCompare = compareSortTokens(left.sortToken, right.sortToken);
    if (tokenCompare !== 0) {
      return tokenCompare;
    }

    const leftJson = serializeCanonicalValue(left.canonicalItem);
    const rightJson = serializeCanonicalValue(right.canonicalItem);
    const jsonCompare = leftJson.localeCompare(rightJson);
    if (jsonCompare !== 0) {
      return jsonCompare;
    }

    return left.index - right.index;
  });

  return decorated.map((entry) => entry.canonicalItem);
}

function sortTokenForArrayItem(item: CanonicalValue, schema: CanonicalArraySchema): string {
  if (schema.arrayKind === "list") {
    return "";
  }

  if (schema.sortBy) {
    if (!isRecord(item)) {
      throw new Error(`Array sort key '${schema.sortBy}' requires object items.`);
    }
    const sortValue = item[schema.sortBy];
    if (sortValue === undefined) {
      throw new Error(`Array sort key '${schema.sortBy}' is missing from an item.`);
    }
    return encodeSortValue(sortValue);
  }

  if (schema.arrayKind === "timeline") {
    throw new Error("timeline arrays must declare sortBy.");
  }

  return serializeCanonicalValue(item);
}

function encodeSortValue(value: unknown): string {
  if (typeof value === "string") {
    return `string:${normalizeString(value, "nfc")}`;
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) {
      throw new Error("Array sort key cannot be non-finite.");
    }
    return `number:${formatCanonicalNumber(value)}`;
  }
  if (typeof value === "boolean") {
    return `boolean:${value}`;
  }
  if (value === null) {
    return "null:";
  }
  throw new Error(`Array sort key must be a primitive value, received ${describeValueType(value)}.`);
}

function compareSortTokens(left: string, right: string): number {
  return compareText(left, right);
}

function normalizeString(value: string, normalization: CanonicalStringNormalization): string {
  return normalization === "none" ? value : value.normalize("NFC");
}

function formatCanonicalNumber(value: number): string {
  if (!Number.isFinite(value)) {
    throw new Error(`Cannot format non-finite number: ${value}.`);
  }

  if (Object.is(value, -0) || value === 0) {
    return "0";
  }

  const sign = value < 0 ? "-" : "";
  const [mantissa, exponentText] = Math.abs(value).toExponential().split("e");
  const exponent = Number.parseInt(exponentText ?? "0", 10);
  const digits = mantissa.replace(".", "");
  const decimalIndex = exponent + 1;

  if (decimalIndex <= 0) {
    return `${sign}0.${"0".repeat(Math.abs(decimalIndex))}${digits}`;
  }

  if (decimalIndex >= digits.length) {
    return `${sign}${digits}${"0".repeat(decimalIndex - digits.length)}`;
  }

  return `${sign}${digits.slice(0, decimalIndex)}.${digits.slice(decimalIndex)}`;
}

function serializeCanonicalValue(value: CanonicalValue): string {
  if (value === null) {
    return "null";
  }
  if (typeof value === "string") {
    return JSON.stringify(normalizeString(value, "nfc"));
  }
  if (typeof value === "number") {
    return formatCanonicalNumber(value);
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => serializeCanonicalValue(item)).join(",")}]`;
  }
  const keys = Object.keys(value).sort(compareText);
  return `{${keys.map((key) => `${JSON.stringify(key)}:${serializeCanonicalValue(value[key])}`).join(",")}}`;
}

function compareText(left: string, right: string): number {
  if (left < right) {
    return -1;
  }
  if (left > right) {
    return 1;
  }
  return 0;
}

function describeValueType(value: unknown): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  return typeof value;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
