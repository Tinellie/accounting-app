# 261002-accounting

A web accounting application starter built with Next.js, Drizzle ORM, and SQLite.

## Stack

- Next.js (App Router) + TypeScript
- MUI (`@mui/material`)
- MUI X Charts (`@mui/x-charts`)
- MUI X Date Pickers (`@mui/x-date-pickers`)
- Day.js
- React Hook Form + Zod
- Drizzle ORM + SQLite (`better-sqlite3`)
- Caddy + Docker Compose

## Local Development

The development configuration allows the LAN hostname `192.168.3.100` in
`allowedDevOrigins`, in addition to Next.js's built-in localhost support.
If the development machine's LAN IP changes, update that exact hostname in
`next.config.ts` and restart the dev server. Without it, Next.js blocks dev
resource/HMR connections from that origin; HTML may load while client-side
interactions do not initialize. This option applies only to development.

The screenshot upload endpoint separately checks `Origin` against the actual
request `Host` (including its port), rather than Next.js's internal server
hostname. Same-origin LAN uploads are supported; cross-origin uploads remain
blocked.

1. Install dependencies.

```bash
npm install
```

2. Copy the environment file.

```bash
cp .env.example .env
```

3. Start the development server.

```bash
npm run dev
```

## Transaction Extra Data

Each transaction has a `data` JSON object, defaulting to `{}`. Nested JSON values
are supported; the top-level value must be an object. SQLite stores this as JSON
text and Drizzle exposes it as an object. Existing form and bulk edits preserve
the field; screenshot imports start with an empty object. No extra-data editor
is exposed yet.

Before using this version with an existing database, run:

```bash
npm run db:backfill-transaction-data
```

This additive, repeatable migration preserves transactions and account balances,
adds a non-null column with an empty-object default, and uses `DATABASE_URL` from
the local environment when configured. Fresh databases created with `db:push`
already include the column.

Run `npm run test:transaction-data` to verify migration, JSON persistence and
preview/import compatibility.

## Dashboard Charts

The category pie chart and its legend share the same order: parent categories
by combined amount descending, then categories within each parent by amount
descending. Direct parent-category transactions contribute to that parent's
total; uncategorized transactions form a separate group. Equal amounts retain
their source order. Sorting does not merge child slices or change percentages.
The existing income/expense, date-range, and currency filters apply before sorting.
The legend shows each parent name and combined amount, with indented child
names and amounts beneath it. Direct parent transactions appear as a separate
child row when that group also contains subcategories; standalone categories
and uncategorized transactions appear only once.
The category-level toggle defaults to showing subcategories. Parent-only mode
combines child slices into their parent and hides child legend rows, without
changing the total. Date options are 7, 30 (default), 90, and 180 days; the
server fetches the full 180-day range.

Run sorting tests with `npm run test:category-chart`.

## Tag Management

The categories page shows **标签** beneath income categories. Tags support
create/edit/delete, icons, colors and two hierarchy levels. Child tags inherit
their parent's color unless explicitly overridden. Parents with children cannot
be deleted or moved under another parent; tags already linked to transactions
cannot be deleted. Each tag has a display name and a separately editable unique
code, like categories. Codes accept 1-50 letters, digits, hyphens or underscores
and are normalized to lowercase. Names remain globally unique.

For an existing database, run `npm run db:backfill-tag-hierarchy` once before
starting the updated app. This repeatable additive migration preserves existing
tags and transaction-tag links. Re-run it when upgrading to tag codes: existing
tags receive stable `tag-ID` codes (with a suffix if needed to avoid collisions),
while already assigned codes are preserved. New databases use the updated Drizzle schema.
Run `npm run test:tags` for isolated migration, hierarchy and CRUD tests.
On the transactions page, **筛选标签** sits below the category filter. Select
multiple tags by name or code: any selected exact tag matches (parents do not
implicitly match children), combined with the other filters using AND. Empty
selection includes untagged transactions.

The sticky selection toolbar has a **批量标签** checkbox selector to the right of
category. Each checkbox reflects the selected visible transactions: checked if
all have the tag, empty if none do, and a dash if only some do. Clicking checked
removes the tag from all selected transactions; clicking empty or partial adds
it to all. Changes save immediately, without replacing other tags or changing
balances. While saving, tag changes are locked until refreshed state arrives;
errors are shown without claiming success. Linked tags appear as themed chips
between the category/type line and date/time on each transaction.
This applies to saved transactions, not import previews.
Saved edits use the Server Action's revalidated response directly, without a
second client-side route refresh. Unchanged transaction rows are memoized so
selection changes and opening the editor do not re-render the entire ledger.
Tag batches are atomic, validate every transaction/tag, and are limited to 500
transactions and 500 tags. `npm run test:tags` also tests these operations.

## Transaction List Filters

The **全部流水** list has a filter panel (import previews are unchanged):
multi-select transaction types, accounts and categories, case-insensitive description search,
an amount popover, and inclusive start/end MUI X date pickers. Empty type/account
selections mean all (including empty category selection). Transaction types appear
at the top; categories, description search and accounts share the second row,
with the description in the middle.
The ledger rows sit in a bordered, independently scrollable container with a
fixed height of 90% of the viewport below
the filters, so scrolling through transactions does not move the filter panel.
Short result sets leave blank space rather than shrinking the container.
The selection/edit toolbar stays sticky at the bottom inside this container,
instead of being fixed to the browser viewport.
Import previews retain their existing scrolling behavior.
Category selections match the chosen category IDs exactly; parent and child
categories can be selected independently. Transfers match either account, and archived accounts remain
available for historical filtering. Changing filters clears selection; select-all
and batch operations apply only to currently visible rows.

Amount filtering uses the **signed displayed value**: expenses are negative,
income/refunds positive, and transfers/adjustments keep their stored sign.
The range slider and precise two-decimal inputs include both endpoints. Blank
limits are unbounded. The default currency is CNY; the menu includes currencies
that occur in the ledger. Conversion is enabled by default and uses the latest
daily public Frankfurter reference rates (server cache: one hour), rounded to
cents for filtering only. No transaction data is sent to the rate provider and
original amounts are never changed. The displayed quote date is the oldest
among the returned rates; these are not historical transaction/execution rates.
Disabling conversion restricts results to the selected original currency.
Missing/unsupported rates and invalid ranges produce explicit errors rather
than assuming a rate or silently omitting unmatched currencies.

Run `npm run test:transaction-filters` for filtering, conversion, sign, rounding,
date-boundary and error-handling tests.

## Alipay HK Screenshot Import

**从支付宝(HK)截图导入** shares the screenshot OCR, AI categorization, editable
preview, and atomic/idempotent saving flow. It reads `M/YYYY` month headings and
ignores the income/expense summary below each heading. Transaction descriptions
are at the upper left, signed `+HKD` / `-HKD` amounts at the upper right, and
`DD/MM hh:mm` timestamps at the lower left. Dates use the nearest preceding
month/year heading (UTC+08:00); invalid dates/amounts remain visible errors.

Amounts are stored in HKD minor units, with `-` for expenses and `+` for income.
Choose an **HKD account**; no currency conversion is performed. Mainland Alipay
refund/status rules are not inferred for this distinct layout. `data` defaults
to `{}`. Narrow screenshots are enlarged locally before row segmentation/OCR.

Run `npm run test:alipay-hk-import`. With local PaddleOCR running, set
`RUN_ALIPAY_HK_OCR=1` to also validate `data/.example/alihk.jpg` (when present).
Tests mock external AI and never write to the real ledger.

## Hang Seng Credit Card PDF Import

On the transactions page, **恒生信用卡导入** accepts a text-based PDF statement
(up to 20 MB, 30 pages, 300 transactions). PDF.js reads each page locally;
PaddleOCR is not needed. Scanned/image-only, encrypted, damaged, or unsupported
statement layouts produce an explicit error instead of guessed transactions.

- Only rows within the large statement box below `TRANS DATE` are parsed.
  `OPENING BALANCE`, cardholder headings, and finance/rewards/summary footers
  are excluded.
- Dates use `DD MMM YYYY`. Transaction dates are saved at midnight UTC+08:00;
  posting dates remain in `data`. A positive unsigned amount is an expense;
  a trailing minus (`3,000.00-`) is income, both stored in integer minor units.
- Address text is appended to the description as `description (address)`.
- Description-only foreign-currency, exchange-rate, CRI, and purchase-ID lines
  attach to the previous transaction, including across page boundaries.
- The editable preview and atomic/idempotent saving are shared with screenshot
  imports. **Any active account currency is allowed** for both Hang Seng PDF sources:
  the amount follows the selected account's currency, without conversion.
  Foreign-currency values and exchange rates are metadata, not conversion inputs.
- Expand the row's debug object to inspect extracted PDF text and `data`.
  AI receives transaction descriptions and category options only, never the PDF,
  dates, amounts, CRI, purchase IDs, or other `data` fields.

Example `data` (decimal strings preserve original precision and trailing zeros):

```json
{
  "postingDate": "2026-08-08",
  "address": "TOKYO",
  "regionCode": "JP",
  "foreignCurrencyAmount": { "currency": "JPY", "amount": "12150" },
  "exchangeRate": "0.050436",
  "cri": "A07626273",
  "purchaseId": "P94557498"
}
```

Only present attachment fields are added; absent address/region values are empty
strings. Malformed transaction/attachment data remains a visible row error.
Run `npm run test:hangseng-import` for parser, sample-PDF (when available),
preview-currency, and isolated-database saving tests. Tests mock AI and do not
send statement data externally or write to the real ledger.

## Hang Seng Bank Account PDF Import

On the transactions page, **恒生银行卡导入** uses the same editable PDF preview
and atomic/idempotent saving as credit-card import (20 MB, 30 pages, 300 rows).

- Only the bounded table under `TRANSACTION HISTORY 進支記錄` is read.
  `B/F BALANCE`, `C/F BALANCE`, `Transaction Summary`, and `Credit Interest Accrued`
  are excluded.
- English and Chinese descriptions are combined as `English (中文)`. Wrapped
  description lines are merged before interpreting the amount, including across
  pages. Repeated transactions without a date inherit the preceding date.
- `D MMM` / `DD MMM` dates use the complete statement date at the top right,
  including previous-year dates for December transactions on a January statement.
  Missing/conflicting statement dates are explicit errors, never the current year.
- Deposit means income; withdrawal means expense. Exactly one unsigned amount
  with two decimal places is required; balance is never imported as an amount.
- PDF text provides exact dates and amounts. If Chinese is embedded as images,
  only the Chinese-description column is rendered and passed to the existing
  **local PaddleOCR service** (start it as described below). OCR failure is explicit.
  Expand the debug object to compare the combined original PDF/OCR lines.
- Account currency follows the selected account without conversion. `data`
  defaults to `{}`; AI classification and all preview editing controls are shared.

Run `npm run test:hangseng-bank-import`. Local sample PDFs are read from
`data/.example/bkhk/bkhk0.pdf` through `bkhk2.pdf` when present. To also verify
real Chinese OCR, start the local service, set `RUN_BANK_OCR=1`, then run the test.
All tests mock external AI and never write to the real ledger.

## CMB Screenshot Import

On the transactions page, **从招商银行截图导入** reuses the local OCR service,
four-way concurrency, AI categorization, editable preview, and atomic saving.
Choose a **截图日期** before uploading; the date picker defaults to today's
Beijing date. `今天` / `昨天` are resolved against that date, not the server's
timezone. An unmarked year uses the selected screenshot year.

- Month headings accept `M月` or `M月/YYYY`, including a separate smaller year.
  Balance summaries and analysis text are ignored.
- Date subheadings accept `M.D`, `今天`, or `昨天`. A new month clears the
  previous day; missing or inconsistent headings produce explicit row errors.
- Whitespace separates headings and two-line transactions. The left icon and
  right-side balance are excluded from transaction fields. The description,
  signed amount (currency symbols/commas ignored), and `[卡号] hh:mm` are parsed.
- After recognition, each distinct card gets its own account selector at the top.
  Mapping a card assigns all its remaining rows to that app account. Different
  cards can map to different CNY accounts or to the same account. The original
  card label stays visible beside each row's selected account.
- Selectors follow the remaining card groups when rows are deleted. Unrecognized
  cards use an explicit `未识别卡号` group and require manual confirmation.
  Per-row editing remains available, and final saving includes all remaining rows.

Run `npm run test:cmb-import` for fast parsing/saving tests. To validate the
local sample `data/bkcn.jpg` with local OCR and mocked AI (no ledger writes):

```powershell
$env:RUN_CMB_OCR_SAMPLES = "1"
node --experimental-transform-types --test scripts/cmb-import.test.mjs
```

## Alipay Screenshot Import

On the transactions page, **从支付宝截图导入** uses the same local PaddleOCR
service, four-way processing, live progress, AI classification, account selection,
preview, cancellation, and atomic saving as WeChat import. The two upload
endpoints share their upload validation and same-origin checks.

- A month header such as `10月` uses the current year in China time, captured
  once at import start; `2025-12` supplies its own year. Transactions use the
  nearest preceding header and validate their `MM-DD HH:mm` date.
- Avatars are cropped out. Only the top description/amount and bottom-left date
  become transaction fields. Middle-left `退款` sets `isRefund: true`; other
  middle-left text is ignored. Middle-right `已全额退款` marks `fullyRefunded`.
- Rows with `交易关闭` in the right-side status area are excluded before
  amount/date retries, refund matching, AI classification, preview, and saving.
- Within the current screenshot only, full-refund purchases and equal-amount
  refund rows match one-to-one by nearest absolute transaction time. Ties retain
  source order. Each refund is used at most once. Missing refunds are inserted
  immediately after their source row, timestamped one minute after the purchase.
  They carry `syntheticRefund: true` and `refundOfId`; linked refunds inherit the
  purchase's expense category and AI feedback. Independent refunds are classified
  as expenses by AI. Invalid amount/date rows are not used to guess refunds.
- Normal expenses store a positive amount and display negative; income stores
  and displays positive. Refunds store a **negative expense amount**, offset
  spending and increase the account balance, without becoming income.
  The preview/debug JSON includes `isRefund`; persisted rows derive the same
  boolean from `type === 'expense' && amount < 0`, requiring no database migration.
  Editing supports negative expenses; income/transfers must stay positive.
  Bulk income/expense reversal explicitly rejects refund rows.
- Chart category totals subtract refunds. The legend retains zero/negative net
  categories, but pie slices include only positive net amounts and calculate
  their percentages from that positive subtotal.
- As with WeChat, debug images and trusted batch JSON are stored under
  `data/import-vx-debug/<batch UUID>/`; `source: "alipay"` distinguishes batches.
  No transactions are saved until confirmed. Rows labelled `交易关闭` are not
  filtered; their amount signs follow the same expense/income rule.

Tests: `npm run test:alipay-import`. To also validate `data/ali-0.jpg` and
`data/ali-1.jpg` through a running local OCR service, set
`RUN_ALIPAY_OCR_SAMPLES=1` and run
`node --experimental-transform-types --test scripts/alipay-import.test.mjs`.
Those sample tests mock DeepSeek, do not send financial data externally, do not
write the ledger, and remove only their own generated batch directories.

## Database Commands

```bash
npm run db:generate
npm run db:push
npm run db:studio
```

## Basic Data Model (MVP)

The schema includes the following core tables:

- `accounts`: where money is stored or moved (cash, bank card, e-wallet)
- `categories`: what the money is for (food, transport, salary)
- `transactions`: each income or expense record

Amounts are stored as integer minor units. For example, `35.00` CNY is stored as `3500`.

## First-Time Database Setup

1. Ensure the environment file exists and includes `DATABASE_URL`.

```bash
cp .env.example .env
```

2. Generate migration files from the schema.

```bash
npm run db:generate
```

3. Apply the schema to the SQLite database.

```bash
npm run db:push
```

4. Inspect tables in Drizzle Studio.

```bash
npm run db:studio
```

## Docker Compose (with Caddy)

### Vultr shared gateway deployment

Use `compose.production.yaml` behind the existing `gateway` Docker network,
not the development Compose Caddy (which would conflict on port 80).
The app's gateway alias is `accounting-web:3000`; only localhost port 3100
is mapped for diagnostics/SSH tunnels. Persisted SQLite, uploads and debug
files live in `accounting_accounting_data`. Preset icons are mounted read-only.
No local ledgers, example statements or environment secrets enter the image.
`sh scripts/backup.sh` creates a consistent SQLite online backup in the data
volume's `backups` directory without stopping the app. Copy backups off-host
regularly; local Docker volumes alone are not disaster recovery.

The image initializes an empty schema using committed Drizzle migrations,
then starts the standalone server as the unprivileged `node` user.
It includes system fonts for Chinese/English PDF rendering. CI checks actual
PDF text extraction and rendered pixels inside the production image.
Already-managed databases apply pending migrations on startup; legacy databases
without a migration journal are explicitly rejected rather than overwritten.
Back up existing data and baseline it deliberately before migrating it.
Do not use `docker compose down -v`.

The GitHub workflow builds Linux app/OCR images on GitHub runners (not the
small production server) and publishes commit-specific GHCR tags. Set Actions
secrets `VULTR_SSH_KEY`, optional `VULTR_SSH_PASSPHRASE`, and the verified
`VULTR_HOST_FINGERPRINT`; set repository variable `DEPLOY_ENABLED=true` only
after `/home/deploy/accounting-app` is prepared with this Git origin.
Deploys fail on tracked local changes/divergence. The short-lived workflow
registry token is used only in a temporary Docker client configuration.
Only the app is automatically updated. The last deployed tags are written to
untracked `.env.images`; source it before manual operations:

```bash
cd /home/deploy/accounting-app
set -a
. ./.env.images
set +a
docker compose -f compose.production.yaml ps
docker compose -f compose.production.yaml logs --tail=100 app
```

OCR is optional and resource-limited: one worker, half a CPU, 768 MB RAM and
up to 2304 MB additional swap (3 GB combined). A real screenshot exceeded the
previous 1536 MB combined limit and caused an OOM restart; the RAM/CPU caps remain
unchanged. Its PP-OCRv5 server models retain recognition quality but run more
slowly; inference must be tested on real-sized crops, not only a small text image.
Production allows up to 300 seconds per OCR call; local development retains
120 seconds. Set `WECHAT_OCR_TIMEOUT_MS` (1000–600000 ms) to override this deadline.
The host must have sufficient free swap. If it cannot stay healthy under these
limits, stop it rather than consume other services' RAM. No OCR port is published. Downloaded models persist
separately. Start/stop it explicitly after pulling its image with registry access:
The manual **Manage Accounting OCR** Actions workflow provides authenticated
start/stop commands and stops OCR automatically if startup fails its health check.

```bash
docker compose -f compose.production.yaml --profile wechat-import up -d --no-build wechat-ocr
docker compose -f compose.production.yaml stop wechat-ocr
```

The gateway route for this deployment is `acc.suzutsuki.com` forwarding to
`accounting-web:3000`. This app does not implement login: public deployment
without gateway authentication allows anyone to read and modify the ledger.
Use authentication or private access for financial data.

### Standalone local Compose

```bash
docker compose up --build
```

The app is reverse-proxied by Caddy at `http://localhost`.

## WeChat Screenshot Import

On the transactions page, choose **从微信截图导入**, then select a JPG, PNG, or
WebP screenshot (up to 20 MB). Recognition runs locally using PaddleOCR
PP-OCRv5 server detection/recognition models, supporting Chinese, English,
and digits. Screenshots are not sent to a third-party OCR API. After OCR,
automatic category recognition sends the complete category list and each row's
description, income/expense type, and temporary transaction ID to DeepSeek.
Images, amounts, dates, account information, and raw OCR boxes are not sent.
After recognition completes, the image selection button and processing step list
are hidden. The preview reuses the transaction form's account selector: selecting
an account assigns its ID, name, and currency to every preview row. Switching or
clearing the selection updates all rows together; amounts are unchanged (no
currency conversion is performed). Recognition alone does not save transactions
or alter account balances. Select a CNY account, click **保存 N 笔交易**, and
confirm to persist the batch and update the account balances. The top account
selector explicitly replaces accounts for all preview rows; individual rows can
instead use different CNY accounts through the selection toolbar or editor.
Before saving, **取消** discards the in-memory preview and selected account,
clears progress/errors, and closes the dialog to return to the transactions
page. Reopening the dialog starts at image selection. It does not write
transactions or remove server-side OCR debug files.
After a confirmed successful save, the dialog automatically closes and clears
the preview. Failed saves keep the preview open with an error so the batch can
be retried safely.

### Saving an import

- Any unresolved red OCR or AI classification error blocks the entire batch. Missing/invalid
  amounts, dates, income/expense directions, or categories also block saving.
  Yellow low-confidence suggestions may be saved after explicit confirmation.
- Saving accepts the batch UUID and explicit edited row values, account IDs and
  manual-confirmation flags. The server reads the original `result.json`,
  verifies retained IDs belong to that batch and are unique, validates every
  field, and checks current categories/accounts. Omitted IDs are deleted from
  the preview only; new IDs and empty batches are rejected. Client-supplied
  debug/error objects are never trusted. Keep the batch directory until saving.
  The legacy batch UUID + single account ID request remains supported.
- All transaction inserts, every affected account's net balance change, and the batch receipt
  are committed in one SQLite transaction. A failure rolls everything back.
- The additive `wechat_import_batches` table is created automatically on the
  first successful save for existing installations and is also declared in the
  Drizzle schema. Its receipt prevents repeated saves of the same UUID, including
  retries after a lost response or a server restart. A saved batch cannot be
  redirected to another account. Deleting imported transactions does not remove
  its receipt.
- This is batch-level deduplication, not screenshot/content deduplication:
  uploading the same screenshot again creates a new batch and can create duplicate
  transactions if saved. The transaction list, account balances, and dashboard
  are refreshed after saving. AI confidence/debug data stays in the batch files;
  transaction rows store the description, category, amount, time, and account.

### Editing an import preview

Both import types reuse the normal list's selection and editing toolbar. It is
sticky inside the import dialog rather than fixed over the main page. Checkboxes
support multiple selection and select-all; Alt+clicking a checkbox or row selects
only that row, even when it was already selected. Normal lists support the same
Alt shortcut.

The toolbar supports batch category/account assignment, income/expense reversal,
single-row editing using the existing entry form, and deletion with confirmation.
All preview operations are local: no database edits or balance updates occur
until **保存 N 笔交易** is confirmed. Saving includes every remaining preview row,
not just the checked rows. Refund rows cannot use income/expense reversal.

Manually choosing a category confirms that category and dismisses its AI
error/warning, but does not dismiss OCR errors. Confirming a valid single-row edit
also resolves its original OCR errors. Original OCR errors and AI responses stay
unchanged in the row/debug JSON; separate manual-review flags record confirmation.
Canceling the import discards these edits. Saving locks further preview changes.

Run `npm run test:preview-edit` for selection/review and edited-save tests.

### DeepSeek automatic categories

No additional npm packages are required: the server uses native `fetch` and Zod.
Set these server-only variables in `.env.local`, then restart Next.js:

```dotenv
DEEPSEEK_API_KEY=your-api-key
DEEPSEEK_MODEL=deepseek-flash
```

The default model is `deepseek-flash`; the endpoint is
`https://api.deepseek.com/chat/completions`. Do not use `NEXT_PUBLIC_` for secrets.
For Docker Compose, provide the same variables via the shell or Compose `.env`
file (Compose does not automatically load Next.js `.env.local`).

The service makes one batch request with the complete category list (including
parent IDs and income/expense types) and all recognized transaction descriptions.
It requests JSON containing one `transactionId`, `categoryId`, `confidence`
(0–1), and Chinese `explanation` per transaction. Results are matched by ID,
not output order. Parent and child categories are both eligible, but must match
the transaction's income/expense direction.

Valid results replace the initial default category, including low-confidence
results. Confidence **strictly below 0.5** shows a yellow warning and the original
returned row. Invalid responses, missing/duplicate/unknown transaction IDs,
unknown or wrong-direction categories, invalid confidence/explanation, API errors,
timeouts, and missing API keys show red errors and available raw response data,
while preserving the initial category and OCR preview. Confidence is model-reported,
not a calibrated probability. AI classification does not write transactions
automatically; valid selected categories are stored only after confirming a save.

AI feedback is independent of `showDebugData`: red/yellow alerts and their raw
AI data remain visible even when original OCR images/objects are hidden.
Confidence and explanations appear left-aligned within each transaction item.
Results are saved alongside
OCR debug data in the batch `result.json`. Cancelling the import aborts an active
DeepSeek request. The processing progress panel includes the AI classification step.

### Local OCR service (Windows, Python 3.10)

Use a dedicated environment; this does not change the application's database.

In VS Code, select **启动开发服务器** in Run and Debug and press **F5** to
launch Next.js and PaddleOCR together in separate terminals. Wait for the OCR
terminal's `Application startup complete` message before importing. Stopping
either debug session stops the compound's other session too. The individual
**仅启动 Next.js** and **启动 PaddleOCR 服务** configurations are also available.
Do not start a second OCR instance if port 8765 is already in use.

The F5 configuration uses `.venv-wechat\Scripts\python.exe` explicitly, independent
of VS Code's selected Python interpreter. Prepare this environment once with the
first two commands below. F5 does not install dependencies automatically.

```powershell
python -m venv .venv-wechat
.\.venv-wechat\Scripts\python.exe -m pip install -r scripts\wechat-ocr\requirements.txt
.\.venv-wechat\Scripts\python.exe -m uvicorn server:app --app-dir scripts\wechat-ocr --host 127.0.0.1 --port 8765
```

The service downloads public model weights on first startup. Wait for
`Application startup complete` before importing. The screenshot preprocessing /
initial OCR queue follows the worker count reported by `/health` (one to four
slice tasks concurrently), avoiding a four-request queue on a one-worker server.
The service defaults
to four independent model workers, with two CPU threads each. On memory-constrained machines,
set `$env:WECHAT_OCR_WORKERS = "1"` before starting it. Check readiness at
`http://127.0.0.1:8765/health`. Do not expose the OCR port to the public internet.

Next.js defaults to `WECHAT_OCR_URL=http://127.0.0.1:8765`; set this server-only
environment variable when using another trusted local service address.

For Docker Compose, enable the optional local OCR service:

```bash
docker compose --profile wechat-import up --build
```

The OCR port remains internal to the Compose network and downloaded models are
cached in the `wechat_ocr_models` volume.

### Processing and debug output

- Detect full-width separators and month-header background changes, then save
  original slices to `data/import-vx-debug/<batch UUID>/1.png`, `2.png`, etc.
- Detect dark backgrounds, invert if needed, remove the avatar from OCR input,
  then convert to black/white. Original comparison images are unchanged.
- Recognize each row, retain text boxes/confidence, and partition by coordinates.
  Upper-right signed amounts are kept separate from lower-right balances.
  Invalid amount/date regions are retried on enlarged grayscale crops.
- Associate each transaction with the nearest preceding year/month header in
  screenshot order, regardless of asynchronous OCR completion order. Dates use
  Chinese local time (`UTC+08:00`); amounts use integer minor units.
- Choose the first top-level category of the corresponding income/expense type,
  ordered by `sortOrder`, then name, as the initial category; subsequently apply
  validated DeepSeek category recommendations as described above.
- Missing/invalid amounts, signs, dates, or year headers remain `null`, with
  explicit red errors. No zero-amount/current-date substitutes are generated.
- The shared transactions list supports local selection/editing in preview mode. Its optional
  `showDebugData` prop controls original slice images and expandable raw OCR
  objects (defaults to `true` for compatibility). The import dialog explicitly
  passes `false` to hide both; validation errors remain visible. Debug data is
  still generated and retained on disk. Recognition itself does not save records
  or change balances; use the dialog's explicit save action. The preview toolbar
  updates its local rows, never the normal list's database edit/delete actions.
- During processing, the dialog receives live step updates from the server:
  service readiness, slicing, preprocessing, first-pass OCR, transaction parsing,
  grayscale retries, DeepSeek category recognition, and preview preparation. Row counters reflect completed work,
  including month headers in the slicing/OCR totals. Retries show completed counts
  rather than an estimated percentage while their total is still being discovered.

The import POST endpoint streams newline-delimited JSON when requested with
`Accept: application/x-ndjson`. Events are `progress`, followed by either a final
`result` or an `error`; a stream ending without a result is treated as a failure.
Errors after streaming starts are delivered as events, not HTTP status changes.
Requests without that Accept header retain the original JSON response format.

Each batch also contains binary inputs, grayscale retry crops, and `result.json`.
Primary OCR coordinates are relative to the avatar-cropped slice; add
`avatarCropLeft` to map x coordinates to the original slice. Retry coordinates
are relative to their saved enlarged image, with original slice crop bounds
recorded alongside them.

Debug output includes sensitive financial information, is git-ignored, and is
retained for manual inspection. Remove specific batch directories when no longer
needed. The image route serves only numeric original slices from UUID batches,
not arbitrary filesystem paths. Closing the dialog cancels the client request;
an inference already running locally may finish, but cannot write transactions.

Run focused parsing, date-validation, dark/light preprocessing, and separator
tests with Node.js 22.6 or newer:

```bash
npm run test:wechat-import
```

```
261002-accounting
├─ 📁app
│  ├─ 📄globals.css
│  ├─ 📄layout.tsx
│  └─ 📄page.tsx
├─ 📁data
│  └─ 📄.gitkeep
├─ 📁src
│  └─ 📁db
│     ├─ 📄index.ts
│     └─ 📄schema.ts
├─ 📄.dockerignore
├─ 📄.gitignore
├─ 📄Caddyfile
├─ 📄docker-compose.yml
├─ 📄Dockerfile
├─ 📄drizzle.config.ts
├─ 📄eslint.config.mjs
├─ 📄next.config.ts
├─ 📄package-lock.json
├─ 📄package.json
├─ 📄README.md
└─ 📄tsconfig.json
```