# Caddy with Cloudflare's DNS module (ADR 0152): the one *.farbaek.si wildcard
# certificate for app previews needs a DNS-01 challenge, and Hostinger's DNS
# has no Caddy module. compose.yaml builds this once per tag; change the tag
# there when a version below changes. Exact versions, each weeks old when chosen.
FROM caddy:2.10.2-builder AS build
RUN xcaddy build v2.10.2 --with github.com/caddy-dns/cloudflare@v0.2.4

FROM caddy:2.10.2
COPY --from=build /usr/bin/caddy /usr/bin/caddy
