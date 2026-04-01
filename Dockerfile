FROM node:22-alpine

WORKDIR /app

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
CMD ["npx", "tsx", "--env-file=.env", "src/server.ts"]
