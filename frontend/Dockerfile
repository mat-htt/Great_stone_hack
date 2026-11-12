FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci --no-audit --no-fund --fetch-retries=5 && test -x node_modules/.bin/tsc
COPY . .
RUN npm run build

FROM nginx:1.27-alpine
RUN apk add --no-cache openssl && mkdir -p /etc/nginx/certs && openssl req -x509 -nodes -newkey rsa:2048 -days 825 -subj "/CN=picpac.local" -keyout /etc/nginx/certs/picpac.key -out /etc/nginx/certs/picpac.crt
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80 443
