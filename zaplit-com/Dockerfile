FROM nginx:alpine
# Cache bust: 2026-03-18T19:53:00Z
COPY dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 8080
