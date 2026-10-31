import { bareKey, planSync, WRITE_KINDS, type Action } from "./plan.ts";
import type { CustomFieldPort, FieldSpec } from "./types.ts";

export interface ApplyResult {
  applied: Action[];
  failed: { action: Action; message: string }[];
  /** What a fresh plan still wants to write after the run. Empty means converged. */
  remaining: Action[];
  /** Fields created in this run, which the API cannot place in a folder. */
  needsFolder: string[];
  /** Blocked and manual items from the final plan: decisions for a human. */
  needsHuman: Action[];
}

/**
 * Executes the write actions of a plan, then plans again against a fresh listing.
 * A sync that answers 200 everywhere but did not converge is reported as such:
 * the second plan, not the status codes, is the proof.
 */
export async function applySync(port: CustomFieldPort, spec: FieldSpec): Promise<ApplyResult> {
  const plan = planSync(spec, await port.list());
  const applied: Action[] = [];
  const failed: ApplyResult["failed"] = [];
  const needsFolder: string[] = [];

  for (const action of plan) {
    try {
      if (action.kind === "create") {
        const { field } = action;
        const created = await port.create({
          name: field.name,
          dataType: field.type,
          ...(field.placeholder !== undefined ? { placeholder: field.placeholder } : {}),
          ...(field.options ? { options: field.options } : {}),
        });
        if (bareKey(created.fieldKey) !== field.key) {
          throw new Error(`GHL assigned the key ${created.fieldKey}, the spec expects contact.${field.key}; fix one of them before syncing again`);
        }
        // The field exists from here on: record it before anything else can fail, or a
        // failed position write would hide it from the folder list for good.
        applied.push(action);
        if (spec.folder) needsFolder.push(field.key);
        // Position goes in a request of its own, like every reorder.
        if (created.position !== field.position) {
          // Counted under the create when it works; a failure is its own entry.
          const reposition: Action = { kind: "reposition", key: field.key, id: created.id, from: created.position, to: field.position };
          try {
            await port.update(created.id, { position: field.position });
          } catch (err) {
            failed.push({ action: reposition, message: (err as Error).message });
          }
        }
        continue;
      } else if (action.kind === "update") {
        await port.update(action.id, action.patch);
      } else if (action.kind === "reposition") {
        await port.update(action.id, { position: action.to });
      } else {
        continue;
      }
      applied.push(action);
    } catch (err) {
      failed.push({ action, message: (err as Error).message });
    }
  }

  const final = planSync(spec, await port.list());
  const remaining = final.filter((action) => WRITE_KINDS.has(action.kind));
  const needsHuman = final.filter((action) => action.kind === "blocked" || action.kind === "manual");
  return { applied, failed, remaining, needsFolder, needsHuman };
}
