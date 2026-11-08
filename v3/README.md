# getsite v3

Fixed-viewport chooser: the page is the customer's future site, and one capsule changes concept, first scene and gallery.
Static ES modules with no build. Preview from the repo root:

    python3 -m http.server 5180 --bind 127.0.0.1    # then open http://127.0.0.1:5180/v3/

## Layout
- `catalog.js`: every choice and what it means for Muse. IDs are a contract; bump `CATALOG_VERSION` when a meaning changes, then run `node v3/backend/build-catalog.mjs`.
- `app.js`, `v3.css`: stage, capsule, trays. `core/`: springs, gestures, state.
- `scenes/`: first scenes, `mount(el, ctx)` and `thumb(box, ctx)`. `gallery/`: FLIP engine plus layouts in `gallery/l/`.
- `order/`: request sheet, brief, API, customer order page (`order.html#t=<key>`).
- `backend/`: Firestore rules and the Apps Script that writes briefs to Drive. **Neither is deployed.**

## Order to Muse
1. Browser saves `orders/<WO-YYYY-NNNN-20 random>` with enum IDs and `briefStatus: 'pending'`.
2. `backend/brief-sync.gs` runs every 5 minutes as the operator, re-renders the brief from IDs using `catalog-snapshot.gs`, and writes `getsite-orders/<key>/brief.md` and `brief.json` to Drive. Browser-written spec text is ignored. Customer words stay in a fenced data block.
3. Muse reads that Drive folder. Give it read access to `getsite-orders` only.

## Status values
The order page shows the section request form when `status` is one of: `결제 완료`, `제작 중`, `수정 중`, `납품 완료`. The operator sets it after payment.

## Deploy steps (operator)
1. Review `backend/firestore.rules`. It closes public listing of orders, and legacy 4-digit order IDs stop working for customers.
2. New Apps Script project: add `brief-sync.gs`, `catalog-snapshot.gs`, `appsscript.json`; run `installTrigger` once.
3. Add `/v3/` to hosting. `firebase.json` points at `public/`, which is not in this repo, so copy `v3/` there first.

## Tests
    node --test tests/v3/unit.test.mjs
    PW_DIR=<dir with playwright-core> node tests/v3/e2e.mjs [screenshot dir]
