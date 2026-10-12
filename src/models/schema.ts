// Validates model output against the subset of JSON Schema the prompts use. Unsupported keywords
// throw, so a schema can never silently validate less than it says.

export type JsonSchema = {
  type?: "object" | "array" | "string" | "number" | "integer" | "boolean" | "null";
  properties?: Record<string, JsonSchema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: JsonSchema;
  enum?: (string | number | boolean | null)[];
  minItems?: number;
  description?: string;
};

const SUPPORTED = new Set([
  "type",
  "properties",
  "required",
  "additionalProperties",
  "items",
  "enum",
  "minItems",
  "description",
]);

function typeOf(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "array";
  if (typeof value === "number") return Number.isInteger(value) ? "integer" : "number";
  return typeof value;
}

export function validateJson(value: unknown, schema: JsonSchema, path = "$"): string[] {
  for (const key of Object.keys(schema)) {
    if (!SUPPORTED.has(key)) throw new Error(`Unsupported JSON Schema keyword "${key}" at ${path}`);
  }
  const problems: string[] = [];
  const actual = typeOf(value);
  if (
    schema.type &&
    actual !== schema.type &&
    !(schema.type === "number" && actual === "integer")
  ) {
    return [`${path}: expected ${schema.type}, got ${actual}`];
  }
  if (schema.enum && !schema.enum.includes(value as string)) {
    problems.push(`${path}: ${JSON.stringify(value)} is not one of ${JSON.stringify(schema.enum)}`);
  }
  if (Array.isArray(value)) {
    if (schema.minItems !== undefined && value.length < schema.minItems) {
      problems.push(`${path}: expected at least ${schema.minItems} items`);
    }
    if (schema.items) {
      const items = schema.items;
      value.forEach((item, i) => {
        problems.push(...validateJson(item, items, `${path}[${i}]`));
      });
    }
  }
  if (actual === "object") {
    const obj = value as Record<string, unknown>;
    for (const key of schema.required ?? []) {
      if (!(key in obj)) problems.push(`${path}.${key}: required`);
    }
    for (const [key, item] of Object.entries(obj)) {
      const sub = schema.properties?.[key];
      if (sub) problems.push(...validateJson(item, sub, `${path}.${key}`));
      else if (schema.additionalProperties === false) problems.push(`${path}.${key}: not allowed`);
    }
  }
  return problems;
}
