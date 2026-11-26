FROM node:22-alpine

# OpenSSL es necesario para el motor de Prisma en Alpine
RUN apk add --no-cache openssl libc6-compat

WORKDIR /app

COPY package.json tsconfig.json ./
COPY prisma ./prisma

RUN npm install
RUN npx prisma generate

COPY src ./src

RUN mkdir -p /app/storage /app/certs

EXPOSE 3000

CMD ["npm", "run", "dev:docker"]
