import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { parseYaml } from "../src/yaml.ts";

test("parses the example spec", () => {
  const doc = parseYaml(readFileSync(new URL("../spec/prospect-profile.yaml", import.meta.url), "utf8")) as Record<string, any>;
  assert.equal(doc.object, "contact");
  assert.equal(doc.positionStart, 100);
  assert.equal(doc.fields.length, 9);
  assert.deepEqual(doc.fields[0], { key: "decision_maker_role", name: "Decision Maker Role", type: "TEXT", placeholder: "e.g. Facilities Director" });
  assert.deepEqual(doc.fields[6].options, ["Jan-Mar", "Apr-Jun", "Jul-Sep", "Oct-Dec", "Unknown"]);
});

test("scalars, quotes, flow lists and comments", () => {
  assert.deepEqual(
    parseYaml(`
a: 1
b: -2.5
c: true
d: ~
e: "quoted # not a comment"
f: 'it''s'
g: [x, "y, z", 3]  # trailing comment
h: plain text with spaces
i: []
`),
    { a: 1, b: -2.5, c: true, d: null, e: "quoted # not a comment", f: "it's", g: ["x", "y, z", 3], h: "plain text with spaces", i: [] },
  );
});

test("nested maps and lists of maps, with lists at the parent's indent", () => {
  assert.deepEqual(
    parseYaml(`
outer:
  inner:
    deep: 1
items:
- name: a
  tags: [one]
- name: b
- plain
`),
    { outer: { inner: { deep: 1 } }, items: [{ name: "a", tags: ["one"] }, { name: "b" }, "plain"] },
  );
});

test("errors carry the line number", () => {
  assert.throws(() => parseYaml("a: 1\n  b: 2"), /line 2: unexpected indentation/);
  assert.throws(() => parseYaml("a: 1\na: 2"), /line 2: duplicate key "a"/);
  assert.throws(() => parseYaml('a: "open'), /line 1: unterminated string/);
  assert.throws(() => parseYaml("a: [1, 2"), /unterminated flow list/);
  assert.throws(() => parseYaml("\ta: 1"), /tabs are not allowed/);
});

test("syntax outside the subset is refused, not misread", () => {
  assert.throws(() => parseYaml("a: &anchor 1"), /unsupported/);
  assert.throws(() => parseYaml("a: |\n  text"), /unsupported/);
  assert.throws(() => parseYaml("a: {b: 1}"), /unsupported/);
});
