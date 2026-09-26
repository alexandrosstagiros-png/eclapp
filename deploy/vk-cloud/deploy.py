#!/usr/bin/python3 -I
"""Validated, root-owned deployment entry point; repository code runs unprivileged."""
import base64
import fcntl
import hashlib
import os
from pathlib import Path, PurePosixPath
import pwd
import re
import shutil
import stat
import subprocess
import sys
import tarfile
import tempfile
import time
import urllib.request

BASE = Path("/opt/ecl")
CURRENT = BASE / "current"
WEB_CURRENT = Path("/var/www/ecl/current")
CSP = Path("/etc/nginx/snippets/ecl-csp.conf")
SHA = re.compile(r"[0-9a-f]{40}\Z")


def run(*args):
    subprocess.run(list(map(str, args)), check=True, env={"PATH":"/usr/sbin:/usr/bin:/sbin:/bin", "LANG":"C.UTF-8"})


def safe_members(archive):
    seen, total, entries = set(), 0, []
    for member in archive:
        name = PurePosixPath(member.name)
        if name.is_absolute() or not name.parts or ".." in name.parts or "\\" in member.name:
            raise ValueError("Unsafe archive path")
        if member.name in seen or not (member.isfile() or member.isdir()):
            raise ValueError("Duplicate archive entry or unsupported archive link/type")
        if any(p in {".git", "node_modules", ".local", ".ssh"} or p == ".env" or (p.startswith(".env.") and p not in {".env.example", ".env.sample"}) for p in name.parts):
            raise ValueError("Archive contains local or secret files")
        seen.add(member.name)
        total += member.size
        if total > 2_000_000_000 or len(seen) > 50_000:
            raise ValueError("Archive exceeds deployment limits")
        entries.append(member)
    return entries


def unpack(snapshot, target):
    # Validate everything before writing, then extract only ordinary directories/files.
    # No tarfile.extract(): links, permissions, ownership and special files are ignored.
    with tarfile.open(snapshot, "r:gz") as archive:
        members = safe_members(archive)
        for member in members:
            path = target.joinpath(*PurePosixPath(member.name).parts)
            if member.isdir():
                path.mkdir(parents=True, exist_ok=True)
            else:
                path.parent.mkdir(parents=True, exist_ok=True)
                with archive.extractfile(member) as source, open(path, "xb") as output:
                    shutil.copyfileobj(source, output)
                path.chmod(0o755 if member.mode & 0o111 else 0o644)
    for required in ("recovered/package.json", "recovered/package-lock.json", "recovered/scripts/migrate.cjs"):
        if not (target / required).is_file():
            raise ValueError("Archive does not contain the complete tracked repository")


def set_owner(tree, user):
    account = pwd.getpwnam(user)
    for base, dirs, files in os.walk(tree):
        for path in [Path(base), *(Path(base)/x for x in dirs + files)]:
            os.chown(path, account.pw_uid, account.pw_gid, follow_symlinks=False)


def freeze(tree):
    root = tree.resolve()
    for base, dirs, files in os.walk(tree, followlinks=False):
        for path in [Path(base), *(Path(base)/x for x in dirs + files)]:
            if path.is_symlink():
                if not path.resolve().is_relative_to(root):
                    raise ValueError("Build created a link outside its release")
                os.chown(path, 0, 0, follow_symlinks=False)
                continue
            info = path.lstat()
            if not (stat.S_ISREG(info.st_mode) or stat.S_ISDIR(info.st_mode)):
                raise ValueError("Build created a special file")
            os.chown(path, 0, 0)
            path.chmod(0o755 if path.is_dir() or info.st_mode & 0o111 else 0o644)


def task(name, user, cwd, command, write_paths=(), environment_file=None):
    args = ["/usr/bin/systemd-run", "--quiet", "--wait", "--pipe", "--collect", "--unit="+name,
        "--property=User="+user, "--property=Group="+user, "--property=WorkingDirectory="+str(cwd),
        "--property=Type=exec", "--property=KillMode=control-group", "--property=TimeoutStartSec=1800",
        "--property=RuntimeMaxSec=1800", "--property=NoNewPrivileges=yes", "--property=PrivateTmp=yes",
        "--property=ProtectSystem=strict", "--property=ProtectHome=yes", "--property=UMask=0077",
        "--property=ProtectKernelTunables=yes", "--property=ProtectKernelModules=yes",
        "--property=ProtectControlGroups=yes", "--property=RestrictSUIDSGID=yes", "--property=CapabilityBoundingSet="]
    if write_paths:
        args.append("--property=ReadWritePaths="+" ".join(map(str,write_paths)))
    if environment_file:
        args.append("--property=EnvironmentFile="+str(environment_file))
    if user == "ecl-build":
        args += ["--setenv=HOME=/var/cache/ecl-build", "--setenv=npm_config_cache=/var/cache/ecl-build/npm"]
    run(*args, *command)


def ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:3001/api/v1/health/ready", timeout=3) as response:
            return response.status == 200
    except Exception:
        return False


def wait_ready():
    for _ in range(30):
        if ready():
            return
        time.sleep(2)
    raise RuntimeError("Application readiness check did not pass")


def link(target, destination):
    temp = destination.with_name(destination.name+".next")
    temp.unlink(missing_ok=True)
    temp.symlink_to(target)
    temp.replace(destination)


def csp_text(html):
    scripts = re.findall(rb"<script>([\s\S]*?)</script>", html)
    if len(scripts) != 1:
        raise ValueError("Expected one inline theme script for CSP")
    digest = base64.b64encode(hashlib.sha256(scripts[0]).digest()).decode()
    # Mirrors the established application policy; only the inline hash is derived.
    return ('add_header Content-Security-Policy "default-src \'none\'; script-src \'self\' https://telegram.org https://st.max.ru \'sha256-'+digest+"'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'self' https://*.telegram.org https://max.ru https://*.max.ru\" always;\n")


def publish_assets(web):
    assets = web / "assets"
    if assets.is_symlink() or not assets.is_dir():
        raise ValueError("Missing regular frontend assets directory")
    for item in assets.iterdir():
        if item.is_symlink() or not item.is_file() or not re.fullmatch(r"[A-Za-z0-9_-]+\.(?:js|css|png|jpg|jpeg|svg|webp|ico|woff|woff2|ttf)", item.name):
            raise ValueError("Unexpected frontend asset")
        destination = Path("/var/www/ecl/assets") / item.name
        # Hashed files never change; stable-name assets may update atomically.
        if destination.exists() and destination.read_bytes() == item.read_bytes():
            continue
        if destination.exists() and re.search(r"-[0-9a-f]{12}\.", item.name):
            raise ValueError("Hash asset collision")
        temp = destination.with_name(destination.name+".next")
        shutil.copyfile(item,temp)
        temp.chmod(0o644)
        temp.replace(destination)


def backup(sha):
    filename = time.strftime("%Y%m%dT%H%M%SZ",time.gmtime())+"-"+sha+".dump"
    temporary = Path("/var/lib/ecl/migration-backups") / filename
    task("ecl-backup-"+sha[:12], "ecl-migrate", "/", ["/usr/bin/node","/usr/local/lib/ecl/backup.cjs",str(temporary)],
        [temporary.parent], "/etc/ecl/migration.env")
    if temporary.is_symlink() or not temporary.is_file() or temporary.stat().st_size == 0:
        raise ValueError("Invalid database backup")
    destination = Path("/var/backups/ecl/db")/filename
    temporary.replace(destination)
    os.chown(destination,0,0)
    destination.chmod(0o600)
    print("Backup saved: "+str(destination), flush=True)


def main():
    if os.geteuid() != 0 or len(sys.argv) != 3 or not SHA.fullmatch(sys.argv[2]):
        raise ValueError("Usage: sudo ecl-deploy /home/ecl-deploy/incoming/<40hexsha>.tar.gz <40hexsha>")
    archive_arg, sha = sys.argv[1:]
    expected = "/home/ecl-deploy/incoming/"+sha+".tar.gz"
    if archive_arg != expected:
        raise ValueError("Archive must be the exact incoming path for this commit")
    for config in ("/etc/ecl/app.env", "/etc/ecl/migration.env"):
        info = os.lstat(config)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != 0 or info.st_mode & 0o077:
            raise ValueError("Environment files must be root-owned regular files with mode 0600")
    with open("/run/lock/ecl-deploy.lock", "a") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        release = BASE / "releases" / sha
        if release.exists():
            if CURRENT.resolve() == release and ready():
                print("This commit is already deployed and healthy")
                return
            raise ValueError("Release already exists; inspect it before retrying this commit")
        fd = os.open(expected, os.O_RDONLY | os.O_NOFOLLOW)
        info = os.fstat(fd)
        if not stat.S_ISREG(info.st_mode) or info.st_uid != pwd.getpwnam("ecl-deploy").pw_uid or info.st_nlink != 1 or info.st_size > 500_000_000:
            os.close(fd)
            raise ValueError("Invalid uploaded archive ownership/type/size")
        with os.fdopen(fd,"rb") as source, tempfile.NamedTemporaryFile(dir="/var/lib/ecl/deploy-archives", suffix=".tar.gz") as snapshot:
            shutil.copyfileobj(source,snapshot)
            snapshot.flush()
            staging = Path(tempfile.mkdtemp(prefix=sha+"-", dir=BASE/"builds"))
            try:
                unpack(snapshot.name,staging)
                set_owner(staging,"ecl-build")
                task("ecl-build-"+sha[:12],"ecl-build",staging/"recovered",
                    ["/bin/sh","-ec","npm ci --no-audit --no-fund && npm run build"], [staging,"/var/cache/ecl-build"])
                freeze(staging)
                staging.replace(release)
            finally:
                if staging.exists():
                    shutil.rmtree(staging)
        previous = CURRENT.resolve() if CURRENT.is_symlink() else None
        previous_web = WEB_CURRENT.resolve() if WEB_CURRENT.is_symlink() else None
        previous_csp = CSP.read_bytes() if CSP.exists() else None
        activated = False
        try:
            web = release/"recovered/apps/office-web/dist"
            if (web/"index.html").is_symlink():
                raise ValueError("Invalid HTML output")
            policy = csp_text((web/"index.html").read_bytes())
            publish_assets(web)
            backup(sha)
            # Existing migrator is checksum-aware and uses a database advisory lock.
            task("ecl-migrate-"+sha[:12],"ecl-migrate",release/"recovered",
                ["/usr/bin/node","scripts/migrate.cjs"], environment_file="/etc/ecl/migration.env")
            link(release,CURRENT)
            activated = True
            run("/usr/bin/systemctl","restart","ecl-app")
            wait_ready()
            link(web,WEB_CURRENT)
            CSP.write_text(policy)
            CSP.chmod(0o644)
            run("/usr/sbin/nginx","-t")
            run("/usr/bin/systemctl","reload","nginx")
            # Five full releases, fourteen deployment snapshots; immutable web assets stay.
            releases = sorted((p for p in (BASE/"releases").iterdir() if SHA.fullmatch(p.name) and p.is_dir() and not p.is_symlink()), key=lambda p:p.stat().st_mtime, reverse=True)
            for old in releases[5:]:
                if old not in (release,previous):
                    shutil.rmtree(old)
            dumps = sorted(Path("/var/backups/ecl/db").glob("*.dump"),reverse=True)
            for old in dumps[14:]:
                old.unlink()
            print("Deployment healthy: "+sha,flush=True)
        except Exception:
            if activated:
                if previous:
                    link(previous,CURRENT)
                    run("/usr/bin/systemctl","restart","ecl-app")
                else:
                    run("/usr/bin/systemctl","stop","ecl-app")
                    CURRENT.unlink(missing_ok=True)
                if previous_web:
                    link(previous_web,WEB_CURRENT)
                else:
                    WEB_CURRENT.unlink(missing_ok=True)
                if previous_csp is not None:
                    CSP.write_bytes(previous_csp)
                else:
                    CSP.unlink(missing_ok=True)
                run("/usr/sbin/nginx","-t")
                run("/usr/bin/systemctl","reload","nginx")
            print("Deployment failed. Database changes are NOT rolled back automatically; inspect the pre-migration snapshot before any restore.",file=sys.stderr)
            raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        # Do not print environment, database credentials or command output here.
        print("Deployment stopped: "+str(error),file=sys.stderr)
        sys.exit(1)
