FROM node:20-alpine

WORKDIR /app

COPY --chown=node:node package*.json ./
RUN npm ci --only=production

COPY --chown=node:node . .

USER node

EXPOSE 7860

ENV PORT=7860 \
    NODE_ENV=production

CMD ["node", "server.js"]
