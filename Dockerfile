FROM node:22-alpine

WORKDIR /app

# Install dependencies first (for Docker layer caching)
COPY package.json package-lock.json* ./
RUN npm ci --only=production 2>/dev/null || npm ci

# Copy source
COPY . .

# Build the frontend
RUN npm run build

# Expose port
EXPOSE 8080

# Start server
CMD ["node", "server/index.ts"]
