FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build

FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache iputils su-exec
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/.output ./.output
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod 755 /docker-entrypoint.sh && mkdir -p /app/data && chown -R node:node /app
ENV NODE_ENV=production
ENV PORT=3000
ENV PORTAL_DATA_FILE=/app/data/portal.json
USER node
EXPOSE 3000
VOLUME /app/data
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", ".output/server/index.mjs"]
