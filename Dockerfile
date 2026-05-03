FROM node:22-bookworm-slim

WORKDIR /app

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Copy Prisma schema before install so @prisma/client can generate the correct client.
COPY package*.json ./
COPY prisma ./prisma

RUN npm ci

COPY . .

# Regenerate client after the full source tree is present, then verify the TypeScript build.
RUN npx prisma generate
RUN npm run build

EXPOSE 3000

# Use tsx in the container because the compiled JS still contains tsconfig path aliases.
# Rely on process.env from the platform (do not require a baked-in .env file).
CMD ["npx", "tsx", "src/server.ts"]
