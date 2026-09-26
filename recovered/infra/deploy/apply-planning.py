#!/usr/bin/env python3
"""Apply a locally tested release. Run as root on the existing application host.

Arguments: unpacked release directory, no secret arguments.
Backups retain the previous runtime, web root, environment, Nginx config and DB.
Rollback retains the additive DB migration so no business data is discarded.
"""
import datetime, hashlib, json, os, pathlib, shutil, subprocess, sys, time, urllib.request

release = pathlib.Path(sys.argv[1]).resolve()
if os.geteuid() != 0 or not (release / 'api/apps/api/dist/main.js').is_file():
    raise SystemExit('Root and a complete release directory are required')
os.umask(0o077)
stamp = datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%SZ')
backup = pathlib.Path('/var/backups/transport-planning') / stamp
backup.mkdir(parents=True, mode=0o700)
api = pathlib.Path('/opt/transport-miniapp')
web = pathlib.Path('/var/www/transport-miniapp')
env = pathlib.Path('/etc/transport-miniapp.env')
nginx = pathlib.Path('/etc/nginx/sites-available/transport-miniapp')
api_stage = pathlib.Path('/opt') / ('.transport-planning-' + stamp)
web_stage = pathlib.Path('/var/www') / ('.transport-planning-' + stamp)
if len({api.stat().st_dev, web.stat().st_dev, backup.stat().st_dev}) != 1:
    raise SystemExit('Atomic deployment requires application and backup paths on one filesystem')

def run(args, **kwargs):
    return subprocess.run(args, check=True, capture_output=True, **kwargs)

def step(message):
    print(message, flush=True)

def ready():
    for attempt in range(30):
        try:
            with urllib.request.urlopen('http://127.0.0.1:3001/api/v1/health/ready', timeout=2) as response:
                if response.status == 200 and json.load(response).get('status') == 'ok': return
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
step('Baseline verified; creating backup at ' + str(backup))
shutil.copy2(env, backup / 'environment')
shutil.copy2(nginx, backup / 'nginx.conf')
with (backup / 'database.dump').open('wb') as output:
    subprocess.run(['runuser', '-u', 'postgres', '--', 'pg_dump', '-Fc', 'transport'], stdout=output, check=True)
run(['pg_restore', '--file=/dev/null', str(backup / 'database.dump')])
step('Database archive verified; staging application')
shutil.copytree(api, api_stage, symlinks=True)
shutil.copytree(web, web_stage, symlinks=True)
shutil.rmtree(api_stage / 'apps/api/dist')
shutil.copytree(release / 'api', api_stage, dirs_exist_ok=True)
shutil.copytree(release / 'web', web_stage, dirs_exist_ok=True)
run(['chown', '-R', 'root:transport-web', str(api_stage)])
run(['chmod', '-R', 'g+rX,o-rwx', str(api_stage)])
run(['chown', '-R', 'root:www-data', str(web_stage)])
run(['chmod', '-R', 'g+rX,o-rwx', str(web_stage)])
run(['/usr/local/bin/node', '--check', str(api_stage / 'apps/api/dist/main.js')])

migration_checksums = {}
for migration_name in ['019_planning.sql', '020_planning_templates.sql']:
    migration = (release / migration_name).read_text()
    checksum = hashlib.sha256(migration.encode()).hexdigest()
    migration_checksums[migration_name] = checksum
    applied = run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-At', '-d', 'transport', '-c',
        "SELECT checksum FROM schema_migrations WHERE name='" + migration_name + "'"], text=True).stdout.strip()
    if applied and applied != checksum:
        raise RuntimeError('Applied migration checksum differs: ' + migration_name)
    if not applied:
        sql = "BEGIN; SET LOCAL lock_timeout='5s'; SET LOCAL statement_timeout='30s'; SELECT pg_advisory_xact_lock(917042001);\n" + migration
        sql += "\nINSERT INTO schema_migrations(name,checksum) VALUES ('" + migration_name + "','" + checksum + "'); COMMIT;"
        run(['runuser', '-u', 'postgres', '--', 'psql', '-X', '-v', 'ON_ERROR_STOP=1', '-d', 'transport'], input=sql, text=True)
step('Additive database migrations applied')
swapped_api = False
swapped_web = False
stopped = False
try:
    shutil.copy2(release / 'nginx.conf', nginx)
    run(['nginx', '-t'])
    run(['systemctl', 'stop', 'transport-miniapp'])
    stopped = True
    os.rename(api, backup / 'api')
    try: os.rename(api_stage, api)
    except Exception:
        os.rename(backup / 'api', api)
        raise
    swapped_api = True
    os.rename(web, backup / 'web')
    try: os.rename(web_stage, web)
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
    print(json.dumps(report), flush=True)
except Exception as error:
    step('Deployment failed; restoring previous application and configuration')
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
    run(['nginx', '-t'])
    run(['systemctl', 'start', 'transport-miniapp'])
    run(['systemctl', 'reload', 'nginx'])
    ready()
    step('Previous application restored. Additive planning migration retained. Backup: ' + str(backup))
    raise SystemExit('Deployment failed: ' + type(error).__name__)
