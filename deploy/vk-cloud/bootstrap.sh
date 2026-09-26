#!/usr/bin/env bash
# Run once as root from a reviewed checkout. Does not create or migrate a database.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
[[ $EUID == 0 ]] || { echo 'Run bootstrap as root' >&2; exit 1; }
source /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || { echo 'Ubuntu 24.04 is required' >&2; exit 1; }
HERE=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y ca-certificates curl gnupg nginx python3 python3-venv sudo rsync build-essential
install -d -m 0755 /etc/apt/keyrings
TEMP_DIR=$(mktemp -d)
trap 'rm -rf -- "$TEMP_DIR"' EXIT
# Download signing keys as data; do not execute remote installation scripts.
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key -o "$TEMP_DIR/nodesource.asc"
gpg --batch --yes --dearmor -o "$TEMP_DIR/nodesource.gpg" "$TEMP_DIR/nodesource.asc"
install -m 0644 "$TEMP_DIR/nodesource.gpg" /etc/apt/keyrings/ecl-nodesource.gpg
echo 'deb [signed-by=/etc/apt/keyrings/ecl-nodesource.gpg] https://deb.nodesource.com/node_22.x nodistro main' > /etc/apt/sources.list.d/ecl-node22.list
curl --fail --silent --show-error --location --proto '=https' --tlsv1.2 https://www.postgresql.org/media/keys/ACCC4CF8.asc -o "$TEMP_DIR/pgdg.asc"
gpg --batch --yes --dearmor -o "$TEMP_DIR/pgdg.gpg" "$TEMP_DIR/pgdg.asc"
install -m 0644 "$TEMP_DIR/pgdg.gpg" /etc/apt/keyrings/ecl-pgdg.gpg
echo 'deb [signed-by=/etc/apt/keyrings/ecl-pgdg.gpg] https://apt.postgresql.org/pub/repos/apt noble-pgdg main' > /etc/apt/sources.list.d/ecl-pgdg.list
apt-get update
apt-get install -y nodejs postgresql-client-17
node -e 'if(process.versions.node.split(".")[0] !== "22") process.exit(1)'
# Certbot 5.4 adds IP-address webroot certificates; Ubuntu's package is older.
python3 -m venv /opt/ecl-certbot
/opt/ecl-certbot/bin/pip install --index-url https://pypi.org/simple --only-binary=:all: 'certbot==5.4.0'
for account in ecl-app ecl-build ecl-migrate; do
  id "$account" >/dev/null 2>&1 || useradd --system --user-group --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin "$account"
done
id ecl-deploy >/dev/null 2>&1 || useradd --create-home --user-group --shell /bin/bash ecl-deploy
passwd --lock ecl-deploy >/dev/null
install -d -o root -g root -m 0755 /opt/ecl /opt/ecl/releases /opt/ecl/builds /usr/local/lib/ecl /var/www/ecl /var/www/ecl/assets /var/www/letsencrypt
install -d -o root -g root -m 0711 /var/lib/ecl
install -d -o root -g root -m 0700 /etc/ecl /var/backups/ecl /var/backups/ecl/db /var/lib/ecl/deploy-archives
install -d -o ecl-app -g ecl-app -m 0700 /var/lib/ecl/onboarding-photos
install -d -o ecl-build -g ecl-build -m 0700 /var/cache/ecl-build
install -d -o ecl-migrate -g ecl-migrate -m 0700 /var/lib/ecl/migration-backups
install -d -o ecl-deploy -g ecl-deploy -m 0700 /home/ecl-deploy/.ssh /home/ecl-deploy/incoming
install -o root -g root -m 0755 "$HERE/deploy.py" /usr/local/sbin/ecl-deploy
install -o root -g root -m 0755 "$HERE/configure-nginx.py" /usr/local/sbin/ecl-configure-nginx
install -o root -g root -m 0644 "$HERE/backup.cjs" /usr/local/lib/ecl/backup.cjs
install -o root -g root -m 0644 "$HERE/ecl-app.service" /etc/systemd/system/ecl-app.service
install -o root -g root -m 0755 "$HERE/reload-nginx.sh" /usr/local/lib/ecl/reload-nginx.sh
install -o root -g root -m 0644 "$HERE/ecl-certbot-renew.service" /etc/systemd/system/ecl-certbot-renew.service
install -o root -g root -m 0644 "$HERE/ecl-certbot-renew.timer" /etc/systemd/system/ecl-certbot-renew.timer
# Only this validated entry point is privileged; no shell, systemctl, or sudo ALL.
echo 'ecl-deploy ALL=(root) NOPASSWD: /usr/local/sbin/ecl-deploy' > "$TEMP_DIR/sudoers"
visudo -cf "$TEMP_DIR/sudoers"
install -o root -g root -m 0440 "$TEMP_DIR/sudoers" /etc/sudoers.d/ecl-deploy
systemctl daemon-reload
systemctl enable ecl-app.service
systemctl enable --now ecl-certbot-renew.timer
echo 'Bootstrap complete. Install the deploy public SSH key and root-only app.env / migration.env; see docs/VK_CLOUD_DEPLOYMENT.md.'
