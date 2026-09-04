#!/bin/sh
# Numéro de build : YYYY.MM.DD.N (N = n° de commit du jour, Europe/Paris).
set -e
export TZ=Europe/Paris

FILE="${1:-src/routes/index.tsx}"
if [ ! -f "$FILE" ]; then
	echo "portal-version: fichier introuvable: $FILE" >&2
	exit 1
fi

stamp=$(date +%Y.%m.%d)
day=$(date +%Y-%m-%d)
if git rev-parse --verify HEAD >/dev/null 2>&1; then
	count=$(git log --since="$day 00:00:00" --until="$day 23:59:59" --pretty=%H | wc -l | tr -d ' ')
else
	count=0
fi
iter=$((count + 1))
version="${stamp}.${iter}"

if grep -q "var PORTAL_VERSION = \"$version\"" "$FILE"; then
	echo "$version"
	exit 0
fi

tmp="${FILE}.version.$$"
sed -E "s/var PORTAL_VERSION = \"[0-9]{4}\\.[0-9]{2}\\.[0-9]{2}\\.[0-9]+\";/var PORTAL_VERSION = \"$version\";/" "$FILE" >"$tmp"
mv "$tmp" "$FILE"
echo "$version"
