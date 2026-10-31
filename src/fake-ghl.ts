import { HttpError } from "./errors.ts";
import { normalizeLabel, STANDARD_CONTACT_FIELDS } from "./spec.ts";
import type { CreateFieldInput, CustomFieldPort, FieldPatch, RemoteField } from "./types.ts";

/**
 * In-memory custom field store for one location, with the behaviors the sync has to
 * respect: `position` is ignored unless it is the only key in an update (with a 200),
 * and names that collide with standard contact fields are refused.
 *
 * Simplification: the fake derives a new field's key from its name. The sync never
 * relies on that; it checks the key it gets back.
 */
export class FakeFieldStore implements CustomFieldPort {
  readonly requests: { op: "list" | "create" | "update"; id?: string; body?: unknown }[] = [];
  private readonly fields: RemoteField[];
  private nextId = 1;

  constructor(seed: RemoteField[] = []) {
    this.fields = structuredClone(seed);
  }

  writes(): number {
    return this.requests.filter((r) => r.op !== "list").length;
  }

  async list(): Promise<RemoteField[]> {
    this.requests.push({ op: "list" });
    return structuredClone(this.fields);
  }

  async create(input: CreateFieldInput): Promise<RemoteField> {
    this.requests.push({ op: "create", body: input });
    if (STANDARD_CONTACT_FIELDS.some((s) => normalizeLabel(s) === normalizeLabel(input.name))) {
      throw new HttpError(422, `"${input.name}" collides with a standard field`);
    }
    const field: RemoteField = {
      id: `cf_fake_${String(this.nextId++).padStart(4, "0")}`,
      name: input.name,
      fieldKey: `contact.${input.name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}`,
      dataType: input.dataType,
      // New fields land after everything else.
      position: Math.max(0, ...this.fields.map((f) => f.position ?? 0)) + 1_000,
    };
    if (input.placeholder !== undefined) field.placeholder = input.placeholder;
    if (input.options) field.picklistOptions = [...input.options];
    this.fields.push(field);
    return structuredClone(field);
  }

  async update(fieldId: string, patch: FieldPatch | { position: number }): Promise<RemoteField> {
    this.requests.push({ op: "update", id: fieldId, body: patch });
    const field = this.fields.find((f) => f.id === fieldId);
    if (!field) throw new HttpError(404, `custom field ${fieldId} not found`);
    const { position, ...rest } = patch as FieldPatch & { position?: number };
    if (rest.name !== undefined) field.name = rest.name;
    if (rest.placeholder !== undefined) field.placeholder = rest.placeholder;
    if (rest.options !== undefined) field.picklistOptions = [...rest.options];
    // The quirk: honored only when position is the only key.
    if (position !== undefined && Object.keys(patch).length === 1) field.position = position;
    return structuredClone(field);
  }
}
