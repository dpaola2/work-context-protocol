# Build stage — compiles TypeScript and installs native deps
FROM node:20-slim AS build

RUN apt-get update && apt-get install -y python3 make g++ && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json tsconfig.json ./

# Copy package.json files for all packages (for npm install)
COPY packages/shared/package.json packages/shared/
COPY packages/mcp/package.json packages/mcp/
COPY packages/server/package.json packages/server/

# Install dependencies
RUN npm ci --ignore-scripts && npm rebuild better-sqlite3

# Copy source files
COPY packages/shared/ packages/shared/
COPY packages/server/ packages/server/

# Build TypeScript
RUN npx tsc -b packages/shared packages/server

# Production stage — minimal runtime image
FROM node:20-slim

WORKDIR /app

# Copy built output and dependencies
COPY --from=build /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=build /app/packages/shared/package.json packages/shared/
COPY --from=build /app/packages/shared/dist/ packages/shared/dist/
COPY --from=build /app/packages/server/package.json packages/server/
COPY --from=build /app/packages/server/dist/ packages/server/dist/
COPY --from=build /app/packages/server/public/ packages/server/public/
COPY --from=build /app/node_modules/ node_modules/

ENV PORT=3000
ENV WCP_DB_PATH=/data/wcp.db

EXPOSE 3000

VOLUME ["/data"]

CMD ["node", "packages/server/dist/index.js"]
