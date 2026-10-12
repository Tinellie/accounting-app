FROM node:22-bookworm-slim AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci

FROM node:22-bookworm-slim AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/data
RUN apt-get update && apt-get install -y --no-install-recommends \
		python3 \
		python3-numpy \
		python3-pil \
		tesseract-ocr \
		tesseract-ocr-chi-sim \
	&& rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
COPY --from=builder /app/scripts/crop_transaction_screenshot.py ./scripts/crop_transaction_screenshot.py
COPY --from=builder /app/data/icons-preset ./data/icons-preset

EXPOSE 3000
CMD ["node", "server.js"]
