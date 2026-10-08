FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/web apps/web
RUN npm run build --workspace @mirotalk/contracts && npm run build --workspace @mirotalk/web

FROM nginx:1.29-alpine
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /workspace/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
