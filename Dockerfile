FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json ./
# better-sqlite3 compiles from source on Alpine (musl), so node-gyp needs these tools.
RUN apk add --no-cache python3 make g++ \
  && npm ci --omit=dev

COPY src ./src
COPY views ./views
COPY public ./public

# Persisted at runtime via a volume; ensures the app can create it on first boot even if empty.
RUN mkdir -p data

ENV NODE_ENV=production
EXPOSE 3000

CMD ["node", "src/server.js"]
