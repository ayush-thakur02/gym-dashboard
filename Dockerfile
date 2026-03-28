FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .

RUN chown -R 1000:1000 /app
USER 1000

EXPOSE 7860

ENV PORT=7860 \
    NODE_ENV=production

CMD ["node", "server.js"]
