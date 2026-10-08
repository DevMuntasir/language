FROM node:24-alpine AS build
WORKDIR /workspace
COPY package.json package-lock.json* tsconfig.base.json ./
COPY packages/contracts/package.json packages/contracts/package.json
COPY apps/control-plane/package.json apps/control-plane/package.json
RUN npm ci
COPY packages/contracts packages/contracts
COPY apps/control-plane apps/control-plane
RUN npm run build --workspace @mirotalk/contracts && npm run build --workspace @mirotalk/control-plane
RUN npm prune --omit=dev

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /workspace/node_modules ./node_modules
COPY --from=build /workspace/packages/contracts ./packages/contracts
COPY --from=build /workspace/apps/control-plane/dist ./dist
COPY --from=build /workspace/apps/control-plane/migrations ./migrations
USER node
EXPOSE 3100
CMD ["node", "dist/server.js"]
