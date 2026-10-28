# syntax=docker/dockerfile:1

# Build: install, run the checks (type check, unit tests), build the static site.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY mcp/package.json mcp/
RUN npm ci --no-audit --no-fund
COPY . .
RUN npm run check && npm run build

# Serve: Caddy with the built files only.
FROM caddy:2.11-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
ENV SITE_ROOT=/srv
EXPOSE 8080
