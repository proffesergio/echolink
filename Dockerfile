FROM node:24-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY src ./src
ENV HOST=0.0.0.0 PORT=8787
USER node
EXPOSE 8787
CMD ["node", "src/server.mjs"]
