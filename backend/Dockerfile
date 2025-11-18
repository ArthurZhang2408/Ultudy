FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install --legacy-peer-deps

COPY . .

EXPOSE 3001

# Run migrations on startup, then start the server
CMD ["sh", "-c", "npm run migrate && node src/server.js"]
