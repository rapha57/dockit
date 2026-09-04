FROM node:22-alpine
WORKDIR /app
RUN apk add --no-cache iputils
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
ENV NITRO_PRESET=node-server
RUN npm run build
ENV NODE_ENV=production
ENV PORT=3000
ENV PORTAL_DATA_FILE=/app/data/portal.json
RUN mkdir -p /app/data && chown -R node:node /app
USER node
EXPOSE 3000
VOLUME /app/data
CMD ["node", ".output/server/index.mjs"]
