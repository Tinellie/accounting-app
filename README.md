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

```bash
docker compose up --build
```

The app is reverse-proxied by Caddy at `http://localhost`.

## WeChat Screenshot Import (Preview Only)

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
currency conversion is performed). This is still a preview and does not save
transactions or alter account balances.

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
not a calibrated probability. No AI output is written to the transaction database.

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
initial OCR queue runs up to four slice tasks concurrently. The service defaults
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
- The shared transactions list runs in read-only preview mode. Its optional
  `showDebugData` prop controls original slice images and expandable raw OCR
  objects (defaults to `true` for compatibility). The import dialog explicitly
  passes `false` to hide both; validation errors remain visible. Debug data is
  still generated and retained on disk. No transaction is saved, no balance is
  modified, and database edit/delete actions are unavailable.
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