FROM node:20-alpine
RUN apk add --no-cache openssl

EXPOSE 3000

WORKDIR /app

ENV NODE_ENV=production

COPY package.json package-lock.json* ./

RUN npm ci --omit=dev && npm cache clean --force

COPY . .

RUN npm run build

# Drop root. node:20-alpine already ships a `node` user; the app only needs to
# read /app at runtime, so give it ownership after the build rather than
# building as an unprivileged user.
RUN chown -R node:node /app
USER node

CMD ["npm", "run", "docker-start"]
