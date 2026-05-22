#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${DOMAIN:-underground.korewadiscord.com}"
UPSTREAM="${UPSTREAM:-http://127.0.0.1:8088}"
SITE_NAME="${SITE_NAME:-korewadiscord}"

sudo tee "/etc/nginx/sites-available/${SITE_NAME}.conf" > /dev/null <<NGINX
server {
    listen 80;
    listen [::]:80;
    server_name ${DOMAIN};

    client_max_body_size 64m;

    location / {
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_set_header X-Forwarded-Host \$host;
        proxy_pass ${UPSTREAM};
        proxy_read_timeout 120s;
    }
}
NGINX

sudo ln -sfn "/etc/nginx/sites-available/${SITE_NAME}.conf" "/etc/nginx/sites-enabled/${SITE_NAME}.conf"
sudo nginx -t
sudo systemctl reload nginx
echo "Installed Nginx site ${SITE_NAME} for ${DOMAIN} -> ${UPSTREAM}"
