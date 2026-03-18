FROM nginx:alpine
# Cache bust: 2026-03-18T20:25:00Z-v2
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
# Disable nginx caching
RUN sed -i 's/sendfile on/sendfile off/g' /etc/nginx/nginx.conf
EXPOSE 8080
