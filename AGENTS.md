# AGENTS.md — Wael Haddad Center website

Read `Source/MAINTENANCE-AR.md` first (Arabic, complete project maintenance guide). When the local `WAELHADDAD-CONTEXT.md` work log exists, read it too; it is optional and kept out of the public repository.

## Rules
- Edit code only in `Source/`. Never hand-edit `Demo/`, `WaelHaddad-complete-with-demo/` or the ZIPs.
- Regenerate outputs with `UPDATE-PACKAGE.command` (runs `Source/tools/package-store.sh`; needs bash + zip, optional node for syntax checks).
- Keep the delivery layout: only `WaelHaddad-complete-with-demo/` and `WaelHaddad-complete-with-demo.zip` are visible in Finder; everything else is hidden with `chflags hidden` by the package script.
- `Source/data.js` must keep `mode: 'demo',` exactly. The package script switches the Hostinger ZIP to `live`.
- No tool or AI names in anything that ships (the package script fails on them).
- This project may be edited by more than one assistant: re-read files before editing. Record changes in commits; also update the optional local work log when present. Keep the maintenance guide current when project behavior changes.

## What is real and what is demo
- Real (from the owner's Facebook page, see `Source/ASSET-SOURCES.md` and `Source/MAINTENANCE-AR.md`): name, slogan, brands, both phones, address, services on the poster, the winter offer (posted 15 Oct 2026), three customer comments (verbatim).
- Demo: everything under `sample` in `data.js` (3 jobs, 2 bookings, a service history for 0791234567). Labelled "sample" on screen. Live mode does not display or initialize these examples; their definitions remain in the static data file.
- Unknown, must be confirmed: WhatsApp on 0795866455, opening hours and days off, exact Google Maps pin, prices, offer end date.

## Behaviours to keep
- Booking ends in a pre-filled WhatsApp message to the shop (`wa.me/962...`). In live mode that is the only thing that reaches the shop.
- The booking submit button is never re-rendered while typing (only `#sum-body` updates); otherwise a tap right after typing is lost.
- Arabic-Indic digits are normalised in phone and plate inputs; mobiles must be Jordanian `07[789]XXXXXXX`.
- Hash routes without slashes (`#book`, `#report-J1024`, `#job-J1024`) so deep links survive hosts that strip `/` in fragments.
- No `alert/confirm/prompt`; confirmations are in-page.
- Customer comments are verbatim, never translated or corrected.
- Admin (demo) has no password and stores in localStorage. The real admin needs a backend (PHP on Hostinger, per the shop playbook) before going live.

## Tests
See `Source/tests/README.md`. Portable smoke, functional-flow, and hero checks are in `Source/tests/`. Serve `Source/` on 127.0.0.1:8765 first. Screenshots and logs are local outputs and do not belong in commits.
