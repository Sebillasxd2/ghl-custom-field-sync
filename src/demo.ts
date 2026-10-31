import { FakeFieldStore } from "./fake-ghl.ts";
import type { RemoteField } from "./types.ts";

/**
 * A location whose fields drifted from spec/prospect-profile.yaml the way real ones
 * do: a label edited by hand, a field dragged out of order, a field created with the
 * wrong type, a label reused under another key, an option list missing a value, and
 * a field nobody declared.
 */
export const DRIFTED: RemoteField[] = [
  { id: "cf_demo_0001", name: "Decision Maker Role", fieldKey: "contact.decision_maker_role", dataType: "TEXT", placeholder: "e.g. Facilities Director", position: 100 },
  { id: "cf_demo_0002", name: "Best time to call", fieldKey: "contact.best_time_to_call", dataType: "TEXT", placeholder: "e.g. weekdays after 3pm", position: 120 },
  { id: "cf_demo_0003", name: "Callback Date", fieldKey: "contact.callback_date", dataType: "DATE", position: 999 },
  { id: "cf_demo_0004", name: "Number of Sites", fieldKey: "contact.number_of_sites", dataType: "TEXT", position: 140 },
  { id: "cf_demo_0005", name: "Current Vendor", fieldKey: "contact.vendor_name", dataType: "TEXT", position: 150 },
  {
    id: "cf_demo_0006",
    name: "Last Call Outcome",
    fieldKey: "contact.last_call_outcome",
    dataType: "SINGLE_OPTIONS",
    picklistOptions: ["No Answer", "Gatekeeper", "Callback Requested", "Not Interested"],
    position: 170,
  },
  { id: "cf_demo_0007", name: "Legacy Lead Score", fieldKey: "contact.legacy_lead_score", dataType: "NUMERICAL", position: 900 },
];

export const driftedLocation = () => new FakeFieldStore(DRIFTED);
