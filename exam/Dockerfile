FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY public ./public
COPY src ./src
COPY views ./views

RUN mkdir -p /app/data

EXPOSE 3000

CMD ["node", "src/server.js"]
