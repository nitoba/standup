#!/bin/sh
# Extract the container's DNS resolver and inject it into the nginx config.
# Only substitutes ${DNS_RESOLVER} — all other $ variables (nginx's own like
# $host, $uri, $proxy_add_x_forwarded_for, etc.) are left untouched.
set -e

DNS_RESOLVER=$(awk '/^nameserver/{print $2; exit}' /etc/resolv.conf)
export DNS_RESOLVER

envsubst '$DNS_RESOLVER' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
