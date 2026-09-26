#!/usr/bin/env python3
"""Install the tested recruitment release on the existing application host.

Usage: python3 apply-recruitment.py /path/to/unpacked-release
Requires a freshly captured baseline.json for API dist and web-root. Existing
environment and Nginx configuration are preserved. The additive migration stays
on rollback; the database backup is never restored over newer business data.
"""
import datetime
import hashlib
import json
import os
import pathlib
import shutil
import subprocess
import sys
import time
import urllib.request


def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)


def ready():
    for _ in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health/ready', timeout=2) as response:
                if response.status == 200 and json.load(response).get('status') == 'ok':
                    return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('Application readiness check failed')


def main():
    release = pathlib.Path(sys.argv[1]).resolve()
    if os.geteuid() != 0 or not (release / 'api/apps/api/dist/main.js').is_file():
        raise SystemExit('Root and a complete release directory are required')
    os.umask(0o077)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
    backup = pathlib.Path('/var/backups/transport-recruitment') / stamp
    api = pathlib.Path('/opt/transport-miniapp')
    web = pathlib.Path('/var/www/transport-miniapp')
    api_stage = pathlib.Path('/opt') / ('.transport-recruitment-' + stamp)
    web_stage = pathlib.Path('/var/www') / ('.transport-recruitment-' + stamp)
    baseline = json.loads((release / 'baseline.json').read_text())
    if set(baseline) != {'api', 'web'} or not all(baseline.values()):
        raise RuntimeError('A complete fresh production baseline is required')

    def verify_baseline():
        for area, expected in baseline.items():
            root = api / 'apps/api/dist' if area == 'api' else web
            actual = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
                      for p in root.rglob('*') if p.is_file()}
            if actual != expected:
                raise RuntimeError('Production baseline changed: ' + area)

    verify_baseline()
    run(['systemctl', 'is-active', 'transport-miniapp'])
    run(['nginx', '-t'])
    backup.mkdir(parents=True, mode=0o700)
    if len({api.stat().st_dev, web.stat().st_dev, backup.stat().st_dev}) != 1:
        raise RuntimeError('Atomic deployment requires paths on one filesystem')
    shutil.copy2('/etc/transport-miniapp.env', backup / 'environment')
    shutil.copy2('/etc/nginx/sites-available/transport-miniapp', backup / 'nginx.conf')
    with (backup / 'database.dump').open('wb') as output:
        subprocess.run(['runuser', '-u', 'postgres', '--', 'pg_dump', '-Fc', 'transport'], stdout=output, check=True)
    run(['pg_restore', '--file=/dev/null', str(backup / 'database.dump')])
    print('Database archive verified; backup: ' + str(backup), flush=True)
    shutil.copytree(api, api_stage, symlinks=True)
    shutil.copytree(web, web_stage, symlinks=True)
    shutil.rmtree(api_stage / 'apps/api/dist')
    shutil.copytree(release / 'api', api_stage, dirs_exist_ok=True)
    # Retain previous hashed assets for already-open browser tabs.
    shutil.copytree(release / 'web', web_stage, dirs_exist_ok=True)
    run(['chown', '-R', 'root:transport-web', str(api_stage)])
    run(['chmod', '-R', 'g+rX,o-rwx', str(api_stage)])
    run(['chown', '-R', 'root:www-data', str(web_stage)])
    run(['chmod', '-R', 'g+rX,o-rwx', str(web_stage)])
    run(['/usr/local/bin/node', '--check', str(api_stage / 'apps/api/dist/main.js')])

    name = '025_recruitment.sql'
    migration = (release / name).read_text()
    checksum = hashlib.sha256(migration.encode()).hexdigest()
    # Check and apply under the same lock used by the normal migration runner.
    sql = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SELECT pg_advisory_xact_lock(917042001);\n"
    sql += "SELECT EXISTS(SELECT FROM schema_migrations WHERE name='" + name + "') AS applied, COALESCE((SELECT checksum FROM schema_migrations WHERE name='" + name + "'),'') AS applied_checksum \\gset migration_\n"
    sql += "\\if :migration_applied\n"
    sql += "SELECT :'migration_applied_checksum' = '" + checksum + "' AS matches \\gset migration_\n"
    sql += "\\if :migration_matches\n\\else\nDO $$ BEGIN RAISE EXCEPTION 'Applied migration checksum differs'; END $$;\n\\endif\n"
    sql += "\\else\n" + migration
    sql += "\nINSERT INTO schema_migrations(name,checksum) VALUES ('" + name + "','" + checksum + "');\n\\endif\nCOMMIT;"
    run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'transport'], input=sql, text=True)
    print('Additive migration applied', flush=True)
    swapped_api = swapped_web = stopped = False
    try:
        verify_baseline()
        run(['systemctl', 'stop', 'transport-miniapp'])
        stopped = True
        os.rename(api, backup / 'api')
        try:
            os.rename(api_stage, api)
        except Exception:
            os.rename(backup / 'api', api)
            raise
        swapped_api = True
        os.rename(web, backup / 'web')
        try:
            os.rename(web_stage, web)
        except Exception:
            os.rename(backup / 'web', web)
            raise
        swapped_web = True
        run(['systemctl', 'start', 'transport-miniapp'])
        ready()
        report = {'status': 'deployed', 'backup': str(backup), 'migration': {name: checksum},
                  'build': json.loads((release / 'build-manifest.json').read_text()),
                  'deployedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
        (backup / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
        if (release / 'restored-source.tar.gz').is_file():
            shutil.copy2(release / 'restored-source.tar.gz', backup / 'restored-source.tar.gz')
        print(json.dumps(report), flush=True)
    except Exception as error:
        if stopped:
            run(['systemctl', 'stop', 'transport-miniapp'])
            if swapped_api:
                os.rename(api, backup / 'failed-api')
                os.rename(backup / 'api', api)
            if swapped_web:
                os.rename(web, backup / 'failed-web')
                os.rename(backup / 'web', web)
            run(['systemctl', 'start', 'transport-miniapp'])
            ready()
        raise SystemExit('Deployment failed; previous runtime retained/restored; additive migration retained. '
                         + type(error).__name__ + '. Backup: ' + str(backup))


if __name__ == '__main__':
    main()
