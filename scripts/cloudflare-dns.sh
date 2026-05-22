#!/usr/bin/env bash
set -euo pipefail

: "${CF_API_TOKEN:?set CF_API_TOKEN in .env or the shell}"
: "${CF_ZONE_ID:?set CF_ZONE_ID in .env or the shell}"
: "${CF_RECORD_NAME:=underground}"
: "${ORIGIN_IP:?set ORIGIN_IP to the VPS public IPv4 address}"

payload=$(jq -n \
  --arg type "A" \
  --arg name "$CF_RECORD_NAME" \
  --arg content "$ORIGIN_IP" \
  '{type: $type, name: $name, content: $content, ttl: 1, proxied: true}')

existing_id=$(curl -fsS \
  -H "Authorization: Bearer ${CF_API_TOKEN}" \
  -H "Content-Type: application/json" \
  "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records?type=A&name=${CF_RECORD_NAME}.korewadiscord.com" \
  | jq -r '.result[0].id // empty')

if [ -n "$existing_id" ]; then
  curl -fsS -X PUT \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records/${existing_id}" | jq .
else
  curl -fsS -X POST \
    -H "Authorization: Bearer ${CF_API_TOKEN}" \
    -H "Content-Type: application/json" \
    --data "$payload" \
    "https://api.cloudflare.com/client/v4/zones/${CF_ZONE_ID}/dns_records" | jq .
fi
