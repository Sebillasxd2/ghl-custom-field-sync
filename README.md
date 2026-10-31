# ghl-custom-field-sync

Declare a location's contact custom fields in one YAML file and sync them into GoHighLevel: matched by key, idempotent, never deleting, and proven by a second plan instead of by status codes.

## The problem

Custom fields get created by hand, renamed, dragged out of order and duplicated, one location at a time. When those fields carry what a rep needs on a call, drift means reps see stale labels, missing options or nothing at all. Clicking through the settings screen to fix it does not scale and does not leave a record of what the fields are supposed to be.

## The traps nobody documents

1. **`position` only applies when it is the only key in the body.** Send `{ name, position }` and you get 200, a new name, and the old position. The sync sends content changes and position in separate requests, and the HTTP adapter refuses to combine them. Pinned by a test in [test/sync.test.ts](test/sync.test.ts).
2. **Match by key, never by label.** Labels are display text and people edit them. A renamed label is an update to the same field. A field that has your label under a different key is a different field: the sync reports it as blocked instead of adopting it or creating a duplicate.
3. **Names that collide with standard contact fields are refused.** "Email", "First Name" or "company-name" will be rejected by GHL, so the spec is validated (ignoring case and punctuation) before anything is sent.
4. **Folders are created in the UI.** Settings, Custom Fields, add a folder and choose the object it belongs to (that dropdown is required). The sync does not create or move folders; it lists the new fields you need to drag in, and once you put the folder's id in the spec it reports fields that sit outside it.
5. **Creating a field solves storage, not visibility.** The value is on the contact; that does not mean the rep sees it during the call. See [visibility.md](visibility.md).

Two policies on top of that: the sync never changes a field's type (existing values would be stranded, so it reports the mismatch for a human), and it never deletes anything (fields that are not in the spec are listed as unmanaged and left alone).

## The solution

```yaml
object: contact
folder: Prospect Profile
positionStart: 100          # positions follow declaration order, 10 apart

fields:
  - key: decision_maker_role
    name: Decision Maker Role
    type: TEXT
    placeholder: "e.g. Facilities Director"
  - key: last_call_outcome
    name: Last Call Outcome
    type: SINGLE_OPTIONS
    options: [No Answer, Gatekeeper, Callback Requested, Not Interested, Meeting Booked]
```

The full example is [spec/prospect-profile.yaml](spec/prospect-profile.yaml). The parser in [src/yaml.ts](src/yaml.ts) reads a strict subset of YAML (maps, lists, flow lists, quoted strings, numbers, booleans, comments) and rejects anything else with a line number rather than misreading it.

1. **Validate** the spec: snake_case unique keys, unique labels, no standard-field collisions, known types, options only where they belong.
2. **Plan** against the location's current fields: `create`, `update`, `reposition`, plus `blocked`, `manual` and `unmanaged` for a human.
3. **Apply** the writes. New fields are created, their returned key is checked against the spec, then they are positioned in a separate request.
4. **Re-plan** against a fresh listing. Converged means that plan has nothing left to write; a run of 200s that did not converge is reported as a failure.

## Run it

Needs Node 22.18 or newer, which runs TypeScript directly. No build step and no runtime dependencies.

```sh
npm test          # the whole suite, offline, no token
npm run demo      # plan, apply and re-plan against a drifted in-memory location
```

`npm install` is only needed for `npm run typecheck`.

```
plan
  create     contact.gatekeeper_name         "Gatekeeper Name" (TEXT) at 110
  update     contact.best_time_to_call       name: "Best time to call" -> "Best Time To Call"
  reposition contact.callback_date           999 -> 130
  blocked    contact.number_of_sites         type is TEXT, spec says NUMERICAL; changing a type would strand existing values, migrate by hand
  blocked    contact.current_vendor          the label "Current Vendor" already belongs to contact.vendor_name; rename one of them or change the spec key
  ...
  unmanaged  contact.legacy_lead_score       "Legacy Lead Score": not in the spec, left alone

applied 6, failed 0
move into the folder in the UI: contact.gatekeeper_name, contact.contract_renewal_month, contact.call_notes
converged: nothing left to write
needs a human:
  ...

second run: 0 actions, 0 writes
```

Against a real location (dry run first, always):

```sh
GHL_API_TOKEN=... GHL_LOCATION_ID=... node src/cli.ts plan  spec/prospect-profile.yaml --live
GHL_API_TOKEN=... GHL_LOCATION_ID=... node src/cli.ts apply spec/prospect-profile.yaml --live
```

The token needs read and write access to the location's custom fields.

## Layout

| path | what |
|---|---|
| `src/spec.ts` | spec validation, standard-field collisions, positions |
| `src/plan.ts` | the diff: by key, never by label, never deleting |
| `src/apply.ts` | writes, key check on create, position alone, re-plan |
| `src/ghl-http.ts` | the port over `services.leadconnectorhq.com` (API v2) |
| `src/fake-ghl.ts` | in-memory location with the position quirk and the collision rule |
| `src/yaml.ts` | the YAML subset parser |
| `visibility.md` | why a synced field may still be invisible on the call |

## Known gaps

- **The key of a new field.** Today the sync creates the field by name and compares the key GHL returns with the spec, stopping on a mismatch. To confirm: whether your account lets you choose the key on creation. The in-memory fake derives it from the name, so the example spec names fields to match their keys.
- **Options payload.** Today options are sent as `options` and read back from `picklistOptions`. To confirm against a test location before syncing option fields.
- **Folder placement.** Today the sync reports placement and does not send a folder on create or update. To confirm: whether the API accepts a folder (parent) for contact fields.
- **Retries.** None: a sync makes a handful of calls. If you hit 429s, wrap the port with the retry layer from the companion `ghl-api-client`.

---

*Pattern extracted from work I did on an outbound sales operation; the code here is written from scratch with synthetic data.*
