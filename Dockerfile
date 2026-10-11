FROM node:20-slim

WORKDIR /app

# Install dependencies (includes devDeps: vite, tsx, prisma CLI).
COPY package*.json ./
RUN npm install

# App source.
COPY . .

# Build the frontend and prepare the SQLite schema.
RUN npx prisma generate && npm run build

ENV API_PORT=3001
ENV PORT=3001
EXPOSE 3001

# Push schema (idempotent) then start the API + static server.
CMD npx prisma db push && ./node_modules/.bin/tsx server/index.ts
