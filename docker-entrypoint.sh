#!/bin/sh
set -e
file="${PORTAL_DATA_FILE:-/app/data/portal.json}"
dir=$(dirname "$file")
mkdir -p "$dir" 2>/dev/null || true

if [ "$(id -u)" = "0" ]; then
	uid="${PUID:-1000}"
	gid="${PGID:-1000}"
	chown -R "$uid:$gid" "$dir"
	exec su-exec "$uid:$gid" "$@"
fi

exec "$@"
