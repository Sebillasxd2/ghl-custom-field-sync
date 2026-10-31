import assert from "node:assert/strict";
import { test } from "node:test";
import { createHttpPort } from "../src/ghl-http.ts";

function recording(response: unknown) {
  const calls: { method: string; url: URL; headers: Record<string, string>; body: unknown }[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    calls.push({
      method: init?.method ?? "GET",
      url: new URL(String(input)),
      headers: init?.headers as Record<string, string>,
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
    });
    return new Response(JSON.stringify(response), { status: 200 });
  }) as typeof fetch;
  return { calls, port: createHttpPort({ token: "t", locationId: "loc_demo_0001", fetch: fetchImpl }) };
}

test("lists contact fields of the location on the public host", async () => {
  const { calls, port } = recording({ customFields: [] });
  await port.list();
  assert.equal(calls[0]?.url.href, "https://services.leadconnectorhq.com/locations/loc_demo_0001/customFields?model=contact");
  assert.equal(calls[0]?.headers.Version, "2021-07-28");
  assert.equal(calls[0]?.headers.Authorization, "Bearer t");
});

test("creates contact fields", async () => {
  const { calls, port } = recording({ customField: { id: "cf_1" } });
  await port.create({ name: "Gatekeeper Name", dataType: "TEXT" });
  assert.deepEqual([calls[0]?.method, calls[0]?.body], ["POST", { name: "Gatekeeper Name", dataType: "TEXT", model: "contact" }]);
});

test("refuses to send position together with anything else", async () => {
  const { calls, port } = recording({ customField: { id: "cf_1" } });
  await assert.rejects(port.update("cf_1", { name: "x", position: 3 } as never), /position must be sent on its own/);
  assert.equal(calls.length, 0);
  await port.update("cf_1", { position: 3 });
  assert.deepEqual([calls[0]?.method, calls[0]?.url.pathname, calls[0]?.body], ["PUT", "/locations/loc_demo_0001/customFields/cf_1", { position: 3 }]);
});
