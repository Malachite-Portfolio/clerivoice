FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

# Install dependencies first for better layer caching.
COPY package*.json ./

# Copy Prisma schema before generating client.
COPY prisma ./prisma
RUN npm ci --omit=dev
RUN npx prisma generate

# Copy application source.
COPY src ./src

EXPOSE 8080

CMD ["npm", "start"]
