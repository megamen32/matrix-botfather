FROM node:22-bookworm-slim

WORKDIR /app


COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY . .

# BotFather needs access to docker socket for mas-cli
# Mount docker socket when running
VOLUME /app/data

CMD ["node", "index.js"]
