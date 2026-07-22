FROM node:22-alpine AS build
WORKDIR /app
ARG VITE_CESIUM_ION_TOKEN=
ENV VITE_CESIUM_ION_TOKEN=$VITE_CESIUM_ION_TOKEN
COPY package.json package-lock.json ./
COPY apps/api/package.json ./apps/api/package.json
COPY apps/web/package.json ./apps/web/package.json
RUN npm ci
COPY apps/web/index.html apps/web/vite.config.ts apps/web/tsconfig.json apps/web/tsconfig.node.json ./apps/web/
COPY apps/web/src ./apps/web/src
RUN npm run build -w @simpleprop/web

FROM nginx:1.27-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
