# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html

# Nginx config for SPA routing
RUN echo 'resolver 127.0.0.11 valid=10s; \
server { \
    listen 3000; \
    root /usr/share/nginx/html; \
    index index.html; \
    client_max_body_size 2G; \
    location / { \
        try_files $uri $uri/ /index.html; \
    } \
    location /api { \
        set $backend_upstream http://backend:8000; \
        proxy_pass $backend_upstream; \
        proxy_http_version 1.1; \
        proxy_set_header Upgrade $http_upgrade; \
        proxy_set_header Connection "upgrade"; \
        proxy_set_header Host $host; \
        proxy_set_header X-Real-IP $remote_addr; \
        proxy_connect_timeout 600s; \
        proxy_send_timeout 600s; \
        proxy_read_timeout 600s; \
    } \
}' > /etc/nginx/conf.d/default.conf

# Set permissions for unprivileged execution
RUN chown -R nginx:nginx /usr/share/nginx/html /var/cache/nginx /var/log/nginx /etc/nginx/conf.d \
    && touch /var/run/nginx.pid \
    && chown -R nginx:nginx /var/run/nginx.pid
USER nginx

EXPOSE 3000
CMD ["nginx", "-g", "daemon off;"]
