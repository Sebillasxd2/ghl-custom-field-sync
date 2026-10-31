import { readFileSync } from "node:fs";
import { DATA_TYPES, OPTION_TYPES, type DataType, type FieldSpec, type SpecField } from "./types.ts";
import { parseYaml, type YamlValue } from "./yaml.ts";

/**
 * Labels of the standard contact fields. GHL refuses a custom field whose name
 * collides with one of them, so the spec is checked before anything is sent.
 * Extend the list if your account shows more standard fields.
 */
export const STANDARD_CONTACT_FIELDS = [
  "First Name", "Last Name", "Full Name", "Email", "Phone", "Company Name", "Address", "Street Address",
  "City", "State", "Postal Code", "Country", "Website", "Timezone", "Date of Birth", "Source", "Tags",
  "Assigned To", "Business Name", "Contact Type", "DND",
];

export class SpecError extends Error {
  readonly problems: string[];

  constructor(problems: string[]) {
    super(`invalid field spec:\n  - ${problems.join("\n  - ")}`);
    this.name = "SpecError";
    this.problems = problems;
  }
}

const POSITION_STEP = 10;
const TOP_LEVEL_KEYS = new Set(["object", "folder", "folderId", "positionStart", "fields"]);
const FIELD_KEYS = new Set(["key", "name", "type", "placeholder", "options", "position"]);

export function loadSpec(path: string): FieldSpec {
  return parseSpec(parseYaml(readFileSync(path, "utf8")));
}

/** Validates the parsed YAML and fills in positions from declaration order. */
export function parseSpec(doc: YamlValue): FieldSpec {
  const problems: string[] = [];
  if (!isMap(doc)) throw new SpecError(["the spec must be a map with object and fields"]);
  // A typo in a key must not be ignored: a misspelled positionStart would silently
  // reposition every field. Unknown keys and wrong types are both problems.
  for (const key of Object.keys(doc)) if (!TOP_LEVEL_KEYS.has(key)) problems.push(`unknown top-level key "${key}"`);
  if (doc.object !== "contact") problems.push(`object must be "contact" (got ${JSON.stringify(doc.object)})`);
  if (!Array.isArray(doc.fields) || doc.fields.length === 0) problems.push("fields must be a non-empty list");
  for (const key of ["folder", "folderId"]) if (key in doc && typeof doc[key] !== "string") problems.push(`${key} must be a string`);
  if ("positionStart" in doc && typeof doc.positionStart !== "number") problems.push("positionStart must be a number");
  const start = typeof doc.positionStart === "number" ? doc.positionStart : 0;

  const fields: SpecField[] = [];
  const keys = new Map<string, number>();
  const names = new Map<string, number>();
  (Array.isArray(doc.fields) ? doc.fields : []).forEach((raw, i) => {
    const at = `fields[${i}]`;
    if (!isMap(raw)) return void problems.push(`${at} must be a map`);
    for (const k of Object.keys(raw)) if (!FIELD_KEYS.has(k)) problems.push(`${at}: unknown key "${k}"`);
    if ("placeholder" in raw && typeof raw.placeholder !== "string") problems.push(`${at}: placeholder must be a string`);
    if ("position" in raw && typeof raw.position !== "number") problems.push(`${at}: position must be a number`);
    const key = String(raw.key ?? "");
    const name = String(raw.name ?? "").trim();
    const type = String(raw.type ?? "") as DataType;
    const options = raw.options;

    if (!/^[a-z][a-z0-9_]*$/.test(key)) problems.push(`${at}: key "${key}" must be snake_case`);
    if (keys.has(key)) problems.push(`${at}: key "${key}" repeats fields[${keys.get(key)}]`);
    keys.set(key, i);
    if (!name) problems.push(`${at}: name is required`);
    const label = normalizeLabel(name);
    if (names.has(label)) problems.push(`${at}: name "${name}" repeats fields[${names.get(label)}]`);
    names.set(label, i);
    const standard = STANDARD_CONTACT_FIELDS.find((s) => normalizeLabel(s) === label);
    if (standard) problems.push(`${at}: name "${name}" collides with the standard field "${standard}"`);
    if (!DATA_TYPES.includes(type)) problems.push(`${at}: type "${type}" is not one of ${DATA_TYPES.join(", ")}`);
    const wantsOptions = OPTION_TYPES.includes(type);
    if (wantsOptions && (!Array.isArray(options) || options.length === 0)) problems.push(`${at}: ${type} needs options`);
    if (!wantsOptions && options !== undefined) problems.push(`${at}: options only apply to ${OPTION_TYPES.join(", ")}`);

    const field: SpecField = {
      key,
      name,
      type,
      position: typeof raw.position === "number" ? raw.position : start + i * POSITION_STEP,
    };
    if (typeof raw.placeholder === "string") field.placeholder = raw.placeholder;
    if (Array.isArray(options)) field.options = options.map(String);
    fields.push(field);
  });

  if (problems.length) throw new SpecError(problems);
  const spec: FieldSpec = { object: "contact", fields };
  if (typeof doc.folder === "string") spec.folder = doc.folder;
  if (typeof doc.folderId === "string") spec.folderId = doc.folderId;
  return spec;
}

/** "First Name", "first_name" and "FIRST-NAME" are the same label to a human. */
export function normalizeLabel(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isMap(value: YamlValue | undefined): value is { [key: string]: YamlValue } {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
