FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci || npm install --legacy-peer-deps

COPY . .

EXPOSE 3001

# Start server (includes migration)
CMD ["npm", "start"]
