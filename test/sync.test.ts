import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { applySync } from "../src/apply.ts";
import { DRIFTED, driftedLocation } from "../src/demo.ts";
import { FakeFieldStore } from "../src/fake-ghl.ts";
import { planSync } from "../src/plan.ts";
import { loadSpec, parseSpec } from "../src/spec.ts";

const spec = loadSpec(fileURLToPath(new URL("../spec/prospect-profile.yaml", import.meta.url)));
const kinds = (actions: { kind: string; key: string }[]) => actions.map((a) => `${a.kind} ${a.key}`);

test("plans every kind of drift, matching fields by key", () => {
  assert.deepEqual(kinds(planSync(spec, DRIFTED)), [
    "create gatekeeper_name",
    "update best_time_to_call",
    "reposition callback_date",
    "blocked number_of_sites",
    "blocked current_vendor",
    "create contract_renewal_month",
    "update last_call_outcome",
    "create call_notes",
    "unmanaged vendor_name",
    "unmanaged legacy_lead_score",
  ]);
});

test("a renamed label is an update of the same field, never a second field", () => {
  const [update] = planSync(spec, DRIFTED).filter((a) => a.key === "best_time_to_call");
  assert.deepEqual(update, {
    kind: "update",
    key: "best_time_to_call",
    id: "cf_demo_0002",
    patch: { name: "Best Time To Call" },
    before: { name: "Best time to call" },
  });
});

test("a matching label under another key is not adopted", () => {
  const [action] = planSync(spec, DRIFTED).filter((a) => a.key === "current_vendor");
  assert.equal(action?.kind, "blocked");
});

test("apply converges, and a second run writes nothing", async () => {
  const store = driftedLocation();
  const first = await applySync(store, spec);
  assert.deepEqual(first.failed, []);
  assert.deepEqual(first.remaining, []);
  assert.deepEqual(kinds(first.needsHuman), ["blocked number_of_sites", "blocked current_vendor"]);
  assert.deepEqual(first.needsFolder, ["gatekeeper_name", "contract_renewal_month", "call_notes"]);

  const writes = store.writes();
  const second = await applySync(store, spec);
  assert.deepEqual(second.applied, []);
  assert.equal(store.writes(), writes, "idempotent: zero writes");
});

test("a field is not renamed onto another field's label: blocked and left for a human, not written", async () => {
  const renaming = parseSpec({ object: "contact", fields: [{ key: "callback_date", name: "Current Vendor", type: "DATE" }] });
  const [action] = planSync(renaming, DRIFTED).filter((a) => a.key === "callback_date" && a.kind !== "reposition");
  assert.equal(action?.kind, "blocked");
  assert.match(action?.kind === "blocked" ? action.reason : "", /label of contact\.vendor_name/);

  const store = driftedLocation();
  const result = await applySync(store, renaming);
  assert.equal((await store.list()).filter((f) => f.name === "Current Vendor").length, 1, "only the field that had the label keeps it");
  assert.deepEqual(kinds(result.needsHuman), ["blocked callback_date"]);
});

test("a created field whose position write fails is still listed for the folder", async () => {
  const store = new FakeFieldStore();
  const failing = Object.assign(Object.create(store), {
    update: async () => {
      throw new Error("429 Too Many Requests");
    },
  }) as FakeFieldStore;
  const result = await applySync(failing, parseSpec({ object: "contact", folder: "Prospect Profile", fields: [{ key: "gatekeeper_name", name: "Gatekeeper Name", type: "TEXT" }] }));
  assert.deepEqual(kinds(result.applied), ["create gatekeeper_name"]);
  assert.deepEqual(result.failed.map((f) => `${f.action.kind} ${f.action.key}`), ["reposition gatekeeper_name"]);
  assert.deepEqual(result.needsFolder, ["gatekeeper_name"]);
});

test("unmanaged fields are never touched", async () => {
  const store = driftedLocation();
  await applySync(store, spec);
  const touched = store.requests.filter((r) => r.op === "update").map((r) => r.id);
  assert.ok(!touched.includes("cf_demo_0007"));
  assert.ok(!touched.includes("cf_demo_0005"));
});

test("position travels alone: combined with a rename it is answered 200 and dropped", async () => {
  const naive = new FakeFieldStore(DRIFTED);
  await naive.update("cf_demo_0003", { name: "Callback Date", position: 130 } as never);
  assert.equal((await naive.list()).find((f) => f.id === "cf_demo_0003")?.position, 999, "silently ignored");

  const store = driftedLocation();
  await applySync(store, spec);
  const bodies = store.requests.filter((r) => r.op === "update").map((r) => Object.keys(r.body as object));
  assert.ok(bodies.every((keys) => !keys.includes("position") || keys.length === 1), JSON.stringify(bodies));
  assert.equal((await store.list()).find((f) => f.id === "cf_demo_0003")?.position, 130);
});

test("new fields are created and then positioned in a second request", async () => {
  const store = new FakeFieldStore();
  await applySync(store, parseSpec({ object: "contact", fields: [{ key: "gatekeeper_name", name: "Gatekeeper Name", type: "TEXT" }] }));
  assert.deepEqual(
    store.requests.filter((r) => r.op !== "list").map((r) => [r.op, r.body]),
    [
      ["create", { name: "Gatekeeper Name", dataType: "TEXT" }],
      ["update", { position: 0 }],
    ],
  );
});

test("a created field whose key differs from the spec is reported, stays created, and the next plan flags it", async () => {
  const store = new FakeFieldStore();
  const mismatched = parseSpec({
    object: "contact",
    fields: [
      { key: "site_count", name: "Number of Sites", type: "NUMERICAL" },
      { key: "call_notes", name: "Call Notes", type: "LARGE_TEXT" },
    ],
  });
  const result = await applySync(store, mismatched);

  assert.equal(result.failed.length, 1);
  assert.match(result.failed[0]!.message, /assigned the key contact\.number_of_sites, the spec expects contact\.site_count/);
  assert.deepEqual(result.applied.map((a) => a.key), ["call_notes"], "the rest of the run continued");
  assert.ok((await store.list()).some((f) => f.fieldKey === "contact.number_of_sites"), "the field exists in the location");
  assert.deepEqual(kinds(planSync(mismatched, await store.list())).filter((k) => !k.endsWith("call_notes")), [
    "blocked site_count",
    "unmanaged number_of_sites",
  ]);
});

test("folder placement is reported once the folder id is known", () => {
  const withFolder = { ...spec, folderId: "folder_demo_01" };
  const remote = DRIFTED.map((f) => (f.id === "cf_demo_0001" ? { ...f, parentId: "folder_demo_01" } : f));
  const manual = planSync(withFolder, remote).filter((a) => a.kind === "manual").map((a) => a.key);
  assert.ok(!manual.includes("decision_maker_role"), "already in the folder");
  assert.ok(manual.includes("best_time_to_call"));
});
