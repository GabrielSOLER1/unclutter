FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev

COPY server.js ./
COPY src ./src
COPY public ./public

VOLUME ["/app/data"]

ENV PORT=3000
EXPOSE 3000

CMD ["node", "server.js"]
