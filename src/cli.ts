import { parseArgs } from "node:util";
import { applySync, type ApplyResult } from "./apply.ts";
import { driftedLocation } from "./demo.ts";
import { createHttpPort } from "./ghl-http.ts";
import { planSync, type Action } from "./plan.ts";
import { loadSpec } from "./spec.ts";
import type { CustomFieldPort } from "./types.ts";

const USAGE = `usage:
  node src/cli.ts demo  <spec.yaml>          plan, apply and re-plan against a drifted in-memory location
  node src/cli.ts plan  <spec.yaml> --live   dry run against GHL_LOCATION_ID
  node src/cli.ts apply <spec.yaml> --live   write the plan to GHL_LOCATION_ID
live mode needs GHL_API_TOKEN and GHL_LOCATION_ID`;

const { positionals, values } = parseArgs({ allowPositionals: true, options: { live: { type: "boolean", default: false } } });
const [command, specPath] = positionals;
if (!command || !specPath || !["demo", "plan", "apply"].includes(command)) {
  console.log(USAGE);
  process.exit(command ? 2 : 0);
}

const spec = loadSpec(specPath);

if (command === "demo") {
  const store = driftedLocation();
  console.log("plan");
  printPlan(planSync(spec, await store.list()));
  const result = await applySync(store, spec);
  printApply(result);
  const writesBefore = store.writes();
  const again = await applySync(store, spec);
  console.log(`\nsecond run: ${again.applied.length} actions, ${store.writes() - writesBefore} writes`);
} else {
  const token = process.env.GHL_API_TOKEN;
  const locationId = process.env.GHL_LOCATION_ID;
  if (!values.live || !token || !locationId) {
    console.error("live mode: pass --live and set GHL_API_TOKEN and GHL_LOCATION_ID");
    process.exit(2);
  }
  const port: CustomFieldPort = createHttpPort({ token, locationId });
  if (command === "plan") printPlan(planSync(spec, await port.list()));
  else printApply(await applySync(port, spec));
}

function printPlan(actions: Action[]): void {
  if (!actions.length) console.log("  in sync");
  for (const action of actions) console.log(`  ${action.kind.padEnd(11)}${`contact.${action.key}`.padEnd(32)}${describe(action)}`);
}

function describe(action: Action): string {
  switch (action.kind) {
    case "create":
      return `"${action.field.name}" (${action.field.type}) at ${action.field.position}`;
    case "update":
      return Object.keys(action.patch)
        .map((k) => `${k}: ${JSON.stringify(action.before[k as keyof typeof action.before])} -> ${JSON.stringify(action.patch[k as keyof typeof action.patch])}`)
        .join(", ");
    case "reposition":
      return `${action.from ?? "none"} -> ${action.to}`;
    case "unmanaged":
      return `"${action.name}": not in the spec, left alone`;
    default:
      return action.reason;
  }
}

function printApply(result: ApplyResult): void {
  console.log(`\napplied ${result.applied.length}, failed ${result.failed.length}`);
  for (const { action, message } of result.failed) console.log(`  failed  contact.${action.key}: ${message}`);
  if (result.needsFolder.length) console.log(`move into the folder in the UI: ${result.needsFolder.map((k) => `contact.${k}`).join(", ")}`);
  if (result.remaining.length) {
    console.log("not converged, a fresh plan still wants to write:");
    printPlan(result.remaining);
  } else {
    console.log("converged: nothing left to write");
  }
  if (result.needsHuman.length) {
    console.log("needs a human:");
    printPlan(result.needsHuman);
  }
  if (result.failed.length || result.remaining.length) process.exitCode = 1;
}
