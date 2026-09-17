#!/bin/sh
set -e
file="${PORTAL_DATA_FILE:-/app/data/portal.json}"
dir=$(dirname "$file")
mkdir -p "$dir" 2>/dev/null || true

# Unraid bind-mounts appdata as 99:100. Docker/Unraid start as root so we can
# chown then drop. OpenShift restricted is already non-root: skip and exec.
if [ "$(id -u)" = "0" ]; then
	uid="${PUID:-1000}"
	gid="${PGID:-1000}"
	chown -R "$uid:$gid" "$dir"
	chmod -R u+rwX,g+rwX "$dir" || true
	exec su-exec "$uid:$gid" "$@"
fi

exec "$@"
