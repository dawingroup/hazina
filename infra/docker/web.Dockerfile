# Static web admin served by nginx on Cloud Run. VITE_* values are baked in at build time.
FROM node:22-alpine AS build
RUN corepack enable
WORKDIR /repo
COPY . .
ARG VITE_API_URL
ARG VITE_FIREBASE_PROJECT_ID
ARG VITE_FIREBASE_API_KEY
RUN pnpm install --frozen-lockfile && pnpm turbo run build --filter=@hazina/web

FROM nginx:1.27-alpine
COPY infra/docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /repo/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
