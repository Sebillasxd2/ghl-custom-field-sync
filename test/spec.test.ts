import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { test } from "node:test";
import { loadSpec, parseSpec, SpecError } from "../src/spec.ts";
import type { YamlValue } from "../src/yaml.ts";

const problemsOf = (doc: YamlValue): string[] => {
  try {
    parseSpec(doc);
    return [];
  } catch (err) {
    assert.ok(err instanceof SpecError);
    return err.problems;
  }
};

const field = (overrides: Record<string, YamlValue> = {}) => ({ key: "best_time_to_call", name: "Best Time To Call", type: "TEXT", ...overrides });

test("positions follow declaration order from positionStart", () => {
  const spec = loadSpec(fileURLToPath(new URL("../spec/prospect-profile.yaml", import.meta.url)));
  assert.deepEqual(spec.fields.map((f) => f.position), [100, 110, 120, 130, 140, 150, 160, 170, 180]);
  assert.equal(spec.folder, "Prospect Profile");
});

test("a name that collides with a standard contact field is refused before any write", () => {
  for (const name of ["Email", "first name", "Company-Name", "POSTAL CODE"]) {
    const [problem] = problemsOf({ object: "contact", fields: [field({ name })] });
    assert.match(problem ?? "", /collides with the standard field/, name);
  }
});

test("keys are snake_case and unique; names are unique ignoring case and punctuation", () => {
  const problems = problemsOf({
    object: "contact",
    fields: [field(), field({ name: "best time to call!" }), field({ key: "Best-Time", name: "Other" })],
  });
  assert.ok(problems.some((p) => /key "best_time_to_call" repeats/.test(p)));
  assert.ok(problems.some((p) => /name "best time to call!" repeats/.test(p)));
  assert.ok(problems.some((p) => /key "Best-Time" must be snake_case/.test(p)));
});

test("option types need options; other types refuse them", () => {
  assert.match(problemsOf({ object: "contact", fields: [field({ type: "SINGLE_OPTIONS" })] })[0] ?? "", /needs options/);
  assert.match(problemsOf({ object: "contact", fields: [field({ options: ["a"] })] })[0] ?? "", /options only apply/);
  assert.match(problemsOf({ object: "contact", fields: [field({ type: "DROPDOWN" })] })[0] ?? "", /is not one of/);
});

test("a misspelled or mistyped key is a problem, not something to ignore", () => {
  const problems = problemsOf({ object: "contact", positionstart: 100, folder: 3, fields: [field({ placehlder: "x" })] });
  assert.ok(problems.includes('unknown top-level key "positionstart"'), problems.join("; "));
  assert.ok(problems.includes("folder must be a string"));
  assert.ok(problems.includes('fields[0]: unknown key "placehlder"'));
  assert.ok(problemsOf({ object: "contact", positionStart: "100", fields: [field()] }).includes("positionStart must be a number"));
  assert.ok(problemsOf({ object: "contact", fields: [field({ position: "5" })] }).includes("fields[0]: position must be a number"));
});

test("the document itself must describe contact fields", () => {
  assert.match(problemsOf({ object: "opportunity", fields: [field()] })[0] ?? "", /object must be "contact"/);
  assert.match(problemsOf({ object: "contact", fields: [] })[0] ?? "", /non-empty list/);
  assert.match(problemsOf(["not", "a", "map"])[0] ?? "", /must be a map/);
});
