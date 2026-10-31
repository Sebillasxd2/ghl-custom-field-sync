import { normalizeLabel } from "./spec.ts";
import type { FieldPatch, FieldSpec, RemoteField, SpecField } from "./types.ts";

export type Action =
  | { kind: "create"; key: string; field: SpecField }
  | { kind: "update"; key: string; id: string; patch: FieldPatch; before: FieldPatch }
  | { kind: "reposition"; key: string; id: string; from: number | undefined; to: number }
  | { kind: "blocked"; key: string; reason: string }
  | { kind: "manual"; key: string; reason: string }
  | { kind: "unmanaged"; key: string; id: string; name: string };

/** Actions the sync performs itself. The rest are reported for a human. */
export const WRITE_KINDS = new Set<Action["kind"]>(["create", "update", "reposition"]);

export const bareKey = (fieldKey: string) => fieldKey.replace(/^contact\./, "");

/**
 * Compares the spec with what the location has. Fields are matched by key only:
 * a label match under a different key is never treated as the same field.
 * Nothing is ever deleted; fields missing from the spec are reported as unmanaged.
 */
export function planSync(spec: FieldSpec, remote: RemoteField[]): Action[] {
  const actions: Action[] = [];
  const byKey = new Map(remote.map((field) => [bareKey(field.fieldKey), field]));

  for (const want of spec.fields) {
    const have = byKey.get(want.key);
    if (!have) {
      const sameLabel = remote.find((field) => normalizeLabel(field.name) === normalizeLabel(want.name));
      actions.push(
        sameLabel
          ? {
              kind: "blocked",
              key: want.key,
              reason: `the label "${want.name}" already belongs to ${sameLabel.fieldKey}; rename one of them or change the spec key`,
            }
          : { kind: "create", key: want.key, field: want },
      );
      continue;
    }

    if (have.dataType !== want.type) {
      actions.push({
        kind: "blocked",
        key: want.key,
        reason: `type is ${have.dataType}, spec says ${want.type}; changing a type would strand existing values, migrate by hand`,
      });
      continue;
    }

    const patch: FieldPatch = {};
    const before: FieldPatch = {};
    if (have.name !== want.name) [patch.name, before.name] = [want.name, have.name];
    if ((have.placeholder ?? "") !== (want.placeholder ?? "")) [patch.placeholder, before.placeholder] = [want.placeholder ?? "", have.placeholder ?? ""];
    if (want.options && !sameList(have.picklistOptions ?? [], want.options)) [patch.options, before.options] = [want.options, have.picklistOptions ?? []];
    if (Object.keys(patch).length) actions.push({ kind: "update", key: want.key, id: have.id, patch, before });

    if (have.position !== want.position) actions.push({ kind: "reposition", key: want.key, id: have.id, from: have.position, to: want.position });

    if (spec.folderId && have.parentId !== spec.folderId) {
      actions.push({ kind: "manual", key: want.key, reason: `move into the "${spec.folder ?? spec.folderId}" folder in the UI` });
    }
  }

  const declared = new Set(spec.fields.map((field) => field.key));
  for (const field of remote) {
    const key = bareKey(field.fieldKey);
    if (!declared.has(key)) actions.push({ kind: "unmanaged", key, id: field.id, name: field.name });
  }
  return actions;
}

function sameList(a: string[], b: string[]): boolean {
  return a.length === b.length && a.every((item, i) => item === b[i]);
}
