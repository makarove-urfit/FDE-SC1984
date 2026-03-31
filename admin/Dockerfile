# --------- Stage 1: Build Frontend ---------
FROM node:20-alpine AS build

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Vite 環境變數透過 Docker build ARG 注入
# docker-compose build 時會從 .env 讀取這些值
ARG VITE_API_BASE=/api/v1
ARG VITE_API_KEY
ARG VITE_APP_SLUG
ARG VITE_AIGO_URL=https://ai-go.app

# 設為 ENV 供 Vite build 時讀取（import.meta.env.VITE_*）
ENV VITE_API_BASE=$VITE_API_BASE
ENV VITE_API_KEY=$VITE_API_KEY
ENV VITE_APP_SLUG=$VITE_APP_SLUG
ENV VITE_AIGO_URL=$VITE_AIGO_URL

RUN npm run build

# --------- Stage 2: Serve with Nginx ---------
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# SPA fallback + API 反向代理
COPY nginx-staging.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
