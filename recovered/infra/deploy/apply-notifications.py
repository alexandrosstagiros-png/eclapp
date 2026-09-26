#!/usr/bin/env python3
"""Install the tested combined calendar, remembered-device and MAX release.

Run as root with the unpacked release path. Secrets are generated on the host.
The additive migrations remain on rollback; business data is never restored
from the backup automatically. MAX webhook registration follows readiness.
"""
import datetime, hashlib, json, os, pathlib, secrets, shutil, subprocess, sys, time, urllib.request

release = pathlib.Path(sys.argv[1]).resolve()
if os.geteuid() != 0 or not (release / 'api/apps/api/dist/main.js').is_file():
    raise SystemExit('Root and a complete release directory are required')
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/var/backups/transport-notifications') / stamp
api = pathlib.Path('/opt/transport-miniapp')
web = pathlib.Path('/var/www/transport-miniapp')
env = pathlib.Path('/etc/transport-miniapp.env')
nginx = pathlib.Path('/etc/nginx/sites-available/transport-miniapp')
ca = pathlib.Path('/etc/transport-miniapp-max-ca.crt')
api_stage = pathlib.Path('/opt') / ('.transport-notifications-' + stamp)
web_stage = pathlib.Path('/var/www') / ('.transport-notifications-' + stamp)

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def step(message):
    print(message, flush=True)

def ready():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health/ready', timeout=2) as response:
                if response.status == 200 and json.load(response).get('status') == 'ok':
                    return
        except Exception:
            pass
        time.sleep(0.5)
    raise RuntimeError('Application readiness check failed')

baseline = json.loads((release / 'baseline.json').read_text())
for area, paths in baseline.items():
    root = api / 'apps/api/dist' if area == 'api' else web
    actual = {str(p.relative_to(root)): hashlib.sha256(p.read_bytes()).hexdigest()
              for p in root.rglob('*') if p.is_file()}
    if actual != paths:
        raise RuntimeError('Production baseline changed: ' + area)
run(['systemctl', 'is-active', 'transport-miniapp'])
run(['nginx', '-t'])
backup.mkdir(parents=True, mode=0o700)
if len({api.stat().st_dev, web.stat().st_dev, backup.stat().st_dev}) != 1:
    raise SystemExit('Atomic deployment requires paths on one filesystem')
step('Baseline verified; backup: ' + str(backup))
shutil.copy2(env, backup / 'environment')
shutil.copy2(nginx, backup / 'nginx.conf')
if ca.exists():
    shutil.copy2(ca, backup / 'max-ca.crt')
with (backup / 'database.dump').open('wb') as output:
    subprocess.run(['runuser', '-u', 'postgres', '--', 'pg_dump', '-Fc', 'transport'], stdout=output, check=True)
run(['pg_restore', '--file=/dev/null', str(backup / 'database.dump')])
step('Database archive verified; staging release')
shutil.copytree(api, api_stage, symlinks=True)
shutil.copytree(web, web_stage, symlinks=True)
shutil.rmtree(api_stage / 'apps/api/dist')
shutil.copytree(release / 'api', api_stage, dirs_exist_ok=True)
# Keep previous hashed assets for tabs opened immediately before deployment.
shutil.copytree(release / 'web', web_stage, dirs_exist_ok=True)
run(['chown', '-R', 'root:transport-web', str(api_stage)])
run(['chmod', '-R', 'g+rX,o-rwx', str(api_stage)])
run(['chown', '-R', 'root:www-data', str(web_stage)])
run(['chmod', '-R', 'g+rX,o-rwx', str(web_stage)])
run(['/usr/local/bin/node', '--check', str(api_stage / 'apps/api/dist/main.js')])

migrations = ['019_planning.sql', '020_planning_templates.sql', '021_remembered_sessions.sql',
              '022_notifications.sql', '023_notification_sources.sql']
migration_checksums = {}
sql = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SELECT pg_advisory_xact_lock(917042001);\n"
for name in migrations:
    migration = (release / name).read_text()
    checksum = hashlib.sha256(migration.encode()).hexdigest()
    migration_checksums[name] = checksum
    applied = run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-At', '-d', 'transport', '-c',
        "SELECT checksum FROM schema_migrations WHERE name='" + name + "'"], text=True).stdout.strip()
    if applied and applied != checksum:
        raise RuntimeError('Applied migration checksum differs: ' + name)
    if not applied:
        sql += migration + "\nINSERT INTO schema_migrations(name,checksum) VALUES ('" + name + "','" + checksum + "');\n"
sql += 'COMMIT;'
run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'transport'], input=sql, text=True)
step('Additive migrations applied')

swapped_api = swapped_web = stopped = False
try:
    current_env = env.read_text()
    values = dict(line.split('=', 1) for line in current_env.splitlines() if '=' in line and not line.lstrip().startswith('#'))
    if not values.get('MAX_BOT_TOKEN'):
        raise RuntimeError('Existing MAX token is missing')
    additions = {
        'MAX_NOTIFICATIONS_ENABLED': 'true',
        'MAX_WEBHOOK_SECRET': values.get('MAX_WEBHOOK_SECRET') or secrets.token_urlsafe(48),
        'MAX_CA_FILE': str(ca),
        'MAX_BOT_USERNAME': 'id890202734370_bot',
        'MAX_NOTIFICATION_REMINDER_SECONDS': '300',
        'MAX_NOTIFICATION_ESCALATION_SECONDS': '900',
        'DOCUMENT_NOTIFICATION_DEADLINE_HOURS': '24',
    }
    lines = [line for line in current_env.splitlines() if line.partition('=')[0] not in additions]
    lines += [key + '=' + value for key, value in additions.items()]
    env_stage = env.with_name(env.name + '.staged')
    env_stage.write_text('\n'.join(lines) + '\n')
    env_stage.chmod(0o600)
    shutil.copy2(release / 'max-api-root.crt', ca)
    ca.chmod(0o644)
    shutil.copy2(release / 'nginx.conf', nginx)
    run(['nginx', '-t'])
    run(['systemctl', 'stop', 'transport-miniapp'])
    stopped = True
    os.replace(env_stage, env)
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
    run(['systemctl', 'reload', 'nginx'])
    ready()
    report = {'status': 'deployed', 'backup': str(backup), 'migrations': migration_checksums,
              'build': json.loads((release / 'build-manifest.json').read_text()),
              'deployedAtUtc': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    (backup / 'deployment.json').write_text(json.dumps(report, indent=2) + '\n')
    shutil.copy2(release / 'restored-source.tar.gz', backup / 'restored-source.tar.gz')
    print(json.dumps(report), flush=True)
except Exception as error:
    step('Deployment failed; restoring previous runtime and configuration')
    if stopped:
        run(['systemctl', 'stop', 'transport-miniapp'])
    if swapped_api:
        os.rename(api, backup / 'failed-api')
        os.rename(backup / 'api', api)
    if swapped_web:
        os.rename(web, backup / 'failed-web')
        os.rename(backup / 'web', web)
    shutil.copy2(backup / 'environment', env)
    shutil.copy2(backup / 'nginx.conf', nginx)
    if (backup / 'max-ca.crt').exists():
        shutil.copy2(backup / 'max-ca.crt', ca)
    run(['nginx', '-t'])
    run(['systemctl', 'start', 'transport-miniapp'])
    run(['systemctl', 'reload', 'nginx'])
    ready()
    step('Previous runtime restored; additive migrations retained. Backup: ' + str(backup))
    raise SystemExit('Deployment failed: ' + type(error).__name__)
