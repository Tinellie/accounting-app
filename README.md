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

## DeepSeek Category Suggestions

The standalone CLI reads transaction descriptions from JSON, reads the current category tree from SQLite in read-only mode, and writes category suggestions to a separate JSON file. It never updates transactions or categories.

The WeChat screenshot import also sends OCR-recognized descriptions and the current category tree to DeepSeek for per-transaction suggestions. The application server reads `DEEPSEEK_API_KEY` from its environment. If it is not set, OCR preview still works and each category can be selected manually. For Docker Compose, set the variable in the shell or the ignored `.env` file before starting the app.

Input format (`id` can be a string or safe integer; descriptions must be 1-2000 characters):

```json
{
	"transactions": [
		{ "id": "txn-001", "description": "地铁公交出行扣款" },
		{ "id": "txn-002", "description": "每月工资到账" }
	]
}
```

See [scripts/examples/deepseek-transactions.json](scripts/examples/deepseek-transactions.json) for a complete sample. Set the API key in the current PowerShell session without placing it in command history, then run the classifier:

```powershell
$secureKey = Read-Host "DeepSeek API key" -AsSecureString
$credential = New-Object System.Net.NetworkCredential('', $secureKey)
$env:DEEPSEEK_API_KEY = $credential.Password
npm.cmd run deepseek:classify -- --input scripts/examples/deepseek-transactions.json --output data/deepseek-category-predictions.json --batch-size 20
Remove-Item Env:DEEPSEEK_API_KEY
```

Use `node scripts/deepseek-classify.mjs --help` to see all options. The CLI defaults to `deepseek-chat`, `DATABASE_URL` (or `data/accounting.db`), and batches of 20 transactions. The output contains each original ID and description, predicted category ID/code/name/type/path, confidence, and a short reason, along with the category tree used for review. Model results are checked against the database tree; unknown category IDs/codes or incomplete responses fail instead of being silently accepted.

Run the offline tests with `npm run test:deepseek`.

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