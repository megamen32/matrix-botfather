FROM node:22-bookworm-slim

WORKDIR /app


COPY package.json package-lock.json ./
RUN npm ci --production && npm install matrix-bot-sdk dotenv

COPY . .

# BotFather needs access to docker socket for mas-cli
# Mount docker socket when running
VOLUME /app/data

CMD ["node", "index.js"]