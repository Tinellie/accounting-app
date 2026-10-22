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