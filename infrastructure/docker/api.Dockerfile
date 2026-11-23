# Build from the repository root:
#   docker build -f infrastructure/docker/api.Dockerfile -t whoosh-stay-api .
FROM node:24-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
COPY packages/shared/package.json packages/shared/
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
RUN npm ci

COPY tsconfig.base.json ./
COPY packages/shared packages/shared
COPY apps/api apps/api
RUN npm run build -w @whoosh/shared \
  && npm run db:generate -w @whoosh/api \
  && npm run build -w @whoosh/api \
  && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules node_modules
COPY --from=build /app/apps/api/node_modules apps/api/node_modules
COPY --from=build /app/packages/shared/package.json packages/shared/package.json
COPY --from=build /app/packages/shared/dist packages/shared/dist
COPY --from=build /app/apps/api/package.json apps/api/package.json
COPY --from=build /app/apps/api/dist apps/api/dist
COPY --from=build /app/apps/api/prisma apps/api/prisma

WORKDIR /app/apps/api
USER node
EXPOSE 4000
CMD ["node", "dist/server.js"]
