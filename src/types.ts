export const DATA_TYPES = [
  "TEXT",
  "LARGE_TEXT",
  "NUMERICAL",
  "PHONE",
  "EMAIL",
  "DATE",
  "CHECKBOX",
  "SINGLE_OPTIONS",
  "MULTIPLE_OPTIONS",
] as const;

export type DataType = (typeof DATA_TYPES)[number];

export const OPTION_TYPES: readonly DataType[] = ["SINGLE_OPTIONS", "MULTIPLE_OPTIONS", "CHECKBOX"];

/** One field as declared in the spec file. */
export interface SpecField {
  /** Stable machine key without the `contact.` prefix. The only thing fields are matched on. */
  key: string;
  /** Display label. Free to change; renaming is an update, never a new field. */
  name: string;
  type: DataType;
  placeholder?: string;
  options?: string[];
  position: number;
}

export interface FieldSpec {
  object: "contact";
  /** Folder the fields belong in. Folders are created in the UI; see the README. */
  folder?: string;
  /** The folder's id, copied from the UI once it exists, so placement can be checked. */
  folderId?: string;
  fields: SpecField[];
}

/** A contact custom field as GHL returns it. */
export interface RemoteField {
  id: string;
  name: string;
  fieldKey: string;
  dataType: string;
  placeholder?: string;
  position?: number;
  parentId?: string;
  picklistOptions?: string[];
}

export interface CreateFieldInput {
  name: string;
  dataType: DataType;
  placeholder?: string;
  options?: string[];
}

export type FieldPatch = { name?: string; placeholder?: string; options?: string[] };

export interface CustomFieldPort {
  list(): Promise<RemoteField[]>;
  create(input: CreateFieldInput): Promise<RemoteField>;
  /** Either a content patch or `{ position }` alone: never both in one call. */
  update(fieldId: string, patch: FieldPatch | { position: number }): Promise<RemoteField>;
}
