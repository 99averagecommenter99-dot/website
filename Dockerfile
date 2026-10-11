FROM node:24-slim

ENV NODE_ENV=production
WORKDIR /app

COPY api.js index.html ./
COPY resources ./resources

USER node
EXPOSE 8080
CMD ["node", "api.js"]
