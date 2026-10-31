# Storage is not visibility

Creating a custom field gives a contact somewhere to keep a value. It does not put that value in front of a rep during a call. These are two different problems, and this repo only solves the first one.

## What I ran into

The plan was simple: give every contact a block of call context (who to ask for, when to call, what happened last time), sync it into custom fields, and have reps read it while dialing.

The fields synced fine. The values were on every contact. But the screens reps actually used while dialing, the in-call view and the manual call queue, showed the contact's standard fields and not the custom ones. Only a small number of custom fields could be pinned to the contact card (two, when I last checked). Everything else was one click away in the full contact record, which during a live dialing session is one click too many.

Screens change between releases, so treat this as something to check, not a fixed fact.

## How to check in five minutes

1. Create a test contact and fill every custom field you care about.
2. Put it in a manual call queue owned by a test user with the same restrictions as your reps.
3. Log in as that user and open the dialer on that contact.
4. Write down exactly which fields you can see without clicking anything.

That list, not the field spec, is what a rep knows when the person picks up.

## What it changes in the design

- **Pick the one or two fields that matter on the call and pin them.** Usually who to ask for and what happened last time. Everything else is for reporting, segmentation and workflows.
- **Keep call context short enough to pin.** A field nobody reads during the call is still useful, just not for the call.
- **Train for the click.** If reps need the full profile, make opening the contact record part of the call routine instead of assuming they will.
- **Re-check after UI updates.** What renders where is the part most likely to change.

The sync in this repo keeps the fields themselves consistent across locations. Whether a rep sees them is a layout decision you make in the CRM, and it deserves its own check.
