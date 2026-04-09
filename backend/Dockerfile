FROM node:20-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
RUN npx prisma generate
ENV NODE_ENV=production
CMD ["npm", "start"]
