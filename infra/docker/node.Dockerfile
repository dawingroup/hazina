# Builds the api or the worker: docker build -f infra/docker/node.Dockerfile --build-arg APP=api .
FROM node:22-alpine AS build
ARG APP
RUN corepack enable
WORKDIR /repo
COPY . .
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@hazina/${APP}...
RUN pnpm --filter=@hazina/${APP} deploy --prod --legacy /out

FROM node:22-alpine
ARG APP
ENV NODE_ENV=production
WORKDIR /app
COPY --from=build /out .
COPY --from=build /repo/packages/db/migrations ./migrations
USER node
EXPOSE 8080
CMD ["sh", "-c", "node dist/$(ls dist | grep -E '^(server|main)\\.js$')"]
