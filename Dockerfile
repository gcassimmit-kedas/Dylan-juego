# Servidor de juego + web en una sola imagen.
#   docker build -t frente-de-batalla .
#   docker run -p 8080:8080 frente-de-batalla
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev
ENV PORT=8080
EXPOSE 8080
CMD ["node", "--experimental-strip-types", "server/index.ts"]
