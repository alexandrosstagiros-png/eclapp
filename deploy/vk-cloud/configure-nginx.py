#!/usr/bin/python3 -I
"""Install the ECL virtual host after certificate issuance, or an ACME-only host."""
import argparse
import fcntl
import os
from pathlib import Path
import re
import subprocess


def render(host, certificate=None, key=None):
    if not re.fullmatch(r"[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?", host) or ".." in host:
        raise ValueError("Use a plain lowercase hostname or IPv4 address")
    challenge = """    location ^~ /.well-known/acme-challenge/ {
        root /var/www/letsencrypt;
        default_type text/plain;
        try_files $uri =404;
    }
"""
    http = f"""server {{
    listen 80;
    server_name {host};
    if ($host != \"{host}\") {{ return 444; }}
    server_tokens off;
    access_log off;
{challenge}"""
    if not certificate:
        return http + "    location / { return 503; }\n}\n"
    for value in (certificate, key):
        if not re.fullmatch(r"/[a-zA-Z0-9_./-]+", value or ""):
            raise ValueError("Certificate paths must be absolute and contain no spaces")
    return http + f"""    location / {{ return 308 https://{host}$request_uri; }}
}}
limit_req_zone $binary_remote_addr zone=ecl_api:10m rate=5r/s;
server {{
    listen 443 ssl;
    server_name {host};
    if ($host != \"{host}\") {{ return 444; }}
    ssl_certificate {certificate};
    ssl_certificate_key {key};
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_session_cache shared:ecl_tls:10m;
    ssl_session_timeout 1d;
    ssl_session_tickets off;
    root /var/www/ecl/current;
    disable_symlinks if_not_owner;
    autoindex off;
    server_tokens off;
    access_log off;
    error_log /var/log/nginx/ecl.error.log warn;
    client_max_body_size 36m;
    client_body_timeout 30s;
    send_timeout 30s;
    include /etc/nginx/snippets/ecl-csp.conf;
    add_header X-Content-Type-Options nosniff always;
    add_header Referrer-Policy no-referrer always;
    add_header Cache-Control no-store always;
    add_header Strict-Transport-Security \"max-age=86400\" always;
    location ~ /\\. {{ return 404; }}
    location ~* ^/api/v1/auth/(dev|demo)(/|$) {{ return 404; }}
    location /api/v1/ {{
        limit_req zone=ecl_api burst=30 nodelay;
        limit_req_status 429;
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Connection \"\";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-Proto https;
        proxy_set_header X-Forwarded-Host $host;
        proxy_set_header X-Dev-Auth-Key \"\";
        proxy_connect_timeout 5s;
        proxy_read_timeout 60s;
        proxy_send_timeout 60s;
    }}
    location = / {{ try_files /index.html =404; }}
    location = /index.html {{ try_files $uri =404; }}
    location = /favicon.svg {{ try_files $uri =404; }}
    # Kept across deployments so an already-open client can load its hashed chunks.
    location ~ ^/assets/[A-Za-z0-9_-]+\\.(js|css|png|jpg|jpeg|svg|webp|ico|woff|woff2|ttf)$ {{
        root /var/www/ecl;
        try_files $uri =404;
    }}
    location / {{ return 404; }}
}}
"""


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("hostname")
    parser.add_argument("--acme-only", action="store_true")
    parser.add_argument("--certificate")
    parser.add_argument("--certificate-key")
    args = parser.parse_args()
    if os.geteuid() != 0:
        parser.error("Run as root")
    if not args.acme_only and not (args.certificate and args.certificate_key):
        parser.error("Supply both certificate paths, or --acme-only")
    if args.acme_only and (args.certificate or args.certificate_key):
        parser.error("Choose ACME-only or HTTPS mode")
    content = render(args.hostname, args.certificate, args.certificate_key)
    if not args.acme_only:
        for item in (args.certificate, args.certificate_key, "/etc/nginx/snippets/ecl-csp.conf"):
            if not Path(item).is_file():
                parser.error("Certificate/key or deployed CSP file is missing")
    with open("/run/lock/ecl-deploy.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        target = Path("/etc/nginx/sites-available/ecl")
        enabled = Path("/etc/nginx/sites-enabled/ecl")
        previous = target.read_bytes() if target.exists() else None
        was_enabled = enabled.is_symlink()
        if enabled.exists() and not was_enabled:
            parser.error("Refusing to replace an unexpected sites-enabled/ecl file")
        try:
            target.write_text(content)
            target.chmod(0o644)
            if not was_enabled:
                enabled.symlink_to(target)
            subprocess.run(["/usr/sbin/nginx", "-t"], check=True)
            subprocess.run(["/usr/bin/systemctl", "reload", "nginx"], check=True)
        except Exception:
            if previous is None:
                target.unlink(missing_ok=True)
            else:
                target.write_bytes(previous)
            if not was_enabled:
                enabled.unlink(missing_ok=True)
            raise
    print("Installed " + ("ACME-only" if args.acme_only else "HTTPS") + " configuration for " + args.hostname)


if __name__ == "__main__":
    main()
