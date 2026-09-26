#!/usr/bin/python3 -I
"""Pull checked public main as ecl-deploy; only the existing deploy helper uses sudo."""
import fcntl
import json
import os
from pathlib import Path
import pwd
import re
import subprocess
import sys
import time
import urllib.error
import urllib.parse
import urllib.request

REPOSITORY = "alexandrosstagiros-png/eclapp"
API = "https://api.github.com/repos/" + REPOSITORY + "/"
GIT_URL = "https://github.com/" + REPOSITORY + ".git"
SHA = re.compile(r"[0-9a-f]{40}\Z")
STATE_DIR = Path("/var/lib/ecl/pull-update")
CACHE = Path("/var/cache/ecl-pull/repository.git")
INCOMING = Path("/home/ecl-deploy/incoming")
CURRENT = Path("/opt/ecl/current")
RELEASES = Path("/opt/ecl/releases")


class UpdateError(Exception):
    def __init__(self, message, retry_after=0):
        super().__init__(message)
        self.retry_after = retry_after


def api_get(path):
    request = urllib.request.Request(API + path, headers={
        "User-Agent": "ECL-public-deployment-updater",
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Cache-Control": "no-cache",
    })
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            data = response.read(2_000_001)
        if len(data) > 2_000_000:
            raise UpdateError("GitHub response exceeds limit")
        return json.loads(data)
    except urllib.error.HTTPError as error:
        delay = 0
        if error.code in (403, 429):
            try:
                delay = max(int(error.headers.get("Retry-After", "0")),
                            int(error.headers.get("X-RateLimit-Reset", "0")) - int(time.time()))
            except (TypeError, ValueError):
                delay = 3600
            delay = max(300, min(delay, 86400))
        raise UpdateError("GitHub API unavailable (HTTP %d)" % error.code, delay) from None
    except (OSError, ValueError):
        raise UpdateError("Cannot read GitHub API response") from None


def command(args, timeout=300, stream=False):
    # No inherited Git configuration, credentials, askpass programs or DB secrets.
    env = {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8",
           "HOME": "/var/cache/ecl-pull", "GIT_CONFIG_NOSYSTEM": "1",
           "GIT_CONFIG_GLOBAL": "/dev/null", "GIT_TERMINAL_PROMPT": "0"}
    try:
        result = subprocess.run(args, check=True, env=env, timeout=timeout, text=True,
                                stdout=None if stream else subprocess.PIPE,
                                stderr=None if stream else subprocess.PIPE)
        return result.stdout or ""
    except (OSError, subprocess.SubprocessError):
        raise UpdateError("Deployment command failed: " + Path(args[0]).name) from None


def is_ready():
    try:
        with urllib.request.urlopen("http://127.0.0.1:3001/api/v1/health/ready", timeout=5) as response:
            return response.status == 200
    except (OSError, urllib.error.URLError):
        return False


class Updater:
    def __init__(self, state_dir=STATE_DIR, cache=CACHE, incoming=INCOMING,
                 current=CURRENT, releases=RELEASES, api=api_get, run=command,
                 ready=is_ready, now=time.time):
        self.state_dir, self.cache, self.incoming = state_dir, cache, incoming
        self.current, self.releases = current, releases
        self.api, self.run, self.ready, self.now = api, run, ready, now
        self.state = {}

    def load_state(self):
        path = self.state_dir / "state.json"
        if path.exists():
            if path.stat().st_size > 16384:
                raise UpdateError("Updater state exceeds limit")
            try:
                self.state = json.loads(path.read_text())
            except (OSError, ValueError):
                raise UpdateError("Cannot read updater state") from None
            if not isinstance(self.state, dict):
                raise UpdateError("Invalid updater state")
            for key in ("last_success_sha", "failed_sha"):
                value = self.state.get(key, "")
                if not isinstance(value, str) or (value and not SHA.fullmatch(value)):
                    raise UpdateError("Invalid updater state commit")
            for key in ("failures", "retry_at"):
                value = self.state.get(key, 0)
                if type(value) is not int or value < 0:
                    raise UpdateError("Invalid updater retry state")

    def save_state(self):
        target = self.state_dir / "state.json"
        temporary = self.state_dir / "state.json.next"
        temporary.write_text(json.dumps(self.state) + "\n")
        temporary.chmod(0o600)
        temporary.replace(target)

    def main_sha(self):
        data = self.api("git/ref/heads/main")
        obj = data.get("object") if isinstance(data, dict) else None
        sha = obj.get("sha") if isinstance(obj, dict) else None
        if not isinstance(sha, str) or not SHA.fullmatch(sha):
            raise UpdateError("GitHub returned an invalid main SHA")
        return sha

    def ci_succeeded(self, sha):
        query = urllib.parse.urlencode({"branch": "main", "event": "push",
                                        "head_sha": sha, "per_page": 100})
        data = self.api("actions/workflows/ci.yml/runs?" + query)
        runs = data.get("workflow_runs") if isinstance(data, dict) else None
        if not isinstance(runs, list):
            raise UpdateError("GitHub returned an invalid CI response")
        matching = [run for run in runs if isinstance(run, dict) and
                    run.get("head_sha") == sha and run.get("head_branch") == "main" and
                    run.get("event") == "push" and
                    isinstance(run.get("head_repository"), dict) and
                    run["head_repository"].get("full_name") == REPOSITORY]
        if not matching:
            return False
        if any(type(run.get("run_number")) is not int or
               type(run.get("run_attempt", 1)) is not int for run in matching):
            raise UpdateError("GitHub returned an invalid CI sequence")
        latest = max(matching, key=lambda run: (run["run_number"], run.get("run_attempt", 1)))
        return latest.get("status") == "completed" and latest.get("conclusion") == "success"

    def healthy_commit(self, sha):
        return (self.current.is_symlink() and self.current.resolve() == self.releases.resolve() / sha
                and self.ready())

    def archive(self, sha):
        git = ["/usr/bin/git", "-c", "core.hooksPath=/dev/null", "-c", "http.sslVerify=true",
               "-c", "credential.helper=", "-c", "protocol.allow=never",
               "-c", "protocol.https.allow=always"]
        if not self.cache.exists():
            self.run(git + ["init", "--bare", str(self.cache)])
        git += ["-C", str(self.cache)]
        # Fetch the checked commit directly; do not run checkout, hooks or repository scripts.
        self.run(git + ["fetch", "--depth=1", "--no-tags", GIT_URL, sha])
        actual = self.run(git + ["rev-parse", "--verify", "FETCH_HEAD^{commit}"]).strip()
        if actual != sha:
            raise UpdateError("Fetched commit does not match checked main")
        target = self.incoming / (sha + ".tar.gz")
        temporary = self.incoming / (sha + ".tar.gz.next")
        try:
            self.run(git + ["archive", "--format=tar.gz", "--output=" + str(temporary), sha])
            temporary.chmod(0o600)
            temporary.replace(target)
        finally:
            temporary.unlink(missing_ok=True)
        return target

    def execute(self):
        self.load_state()
        now = int(self.now())
        # API/network failures without a known SHA back off before making any request.
        if not self.state.get("failed_sha") and now < self.state.get("retry_at", 0):
            return "Waiting before retrying GitHub access"
        sha = ""
        try:
            sha = self.main_sha()
            if self.state.get("last_success_sha") == sha and self.healthy_commit(sha):
                return "Current main is already deployed and healthy"
            # One ref request detects a new commit even when an older release failed.
            if sha == self.state.get("failed_sha") and now < self.state.get("retry_at", 0):
                return "Waiting before retrying the failed release"
            if not self.ci_succeeded(sha):
                return "Waiting for successful push CI for current main"
            if self.healthy_commit(sha):
                self.state = {"last_success_sha": sha, "failures": 0, "retry_at": 0}
                self.save_state()
                return "Recorded the already healthy current main"
            archive = self.archive(sha)
            if self.main_sha() != sha:
                # The source archive is disposable; never remove an installed/failed release.
                archive.unlink(missing_ok=True)
                return "Skipped release because main changed during download"
            self.run(["/usr/bin/sudo", "-n", "--", "/usr/local/sbin/ecl-deploy",
                      str(archive), sha], timeout=6600, stream=True)
            if not self.healthy_commit(sha):
                raise UpdateError("Deployed release did not remain ready")
            self.state = {"last_success_sha": sha, "failures": 0, "retry_at": 0}
            self.save_state()
            archive.unlink(missing_ok=True)
            return "Deployed checked main " + sha
        except (UpdateError, OSError) as error:
            count = self.state.get("failures", 0) + 1 if self.state.get("failed_sha", "") == sha else 1
            delay = max(min(300 * (2 ** min(count - 1, 4)), 3600), getattr(error, "retry_after", 0))
            self.state.update({"failed_sha": sha, "failures": count, "retry_at": int(self.now()) + delay})
            self.save_state()
            if isinstance(error, OSError):
                raise UpdateError("Updater filesystem operation failed") from None
            raise


def main():
    if os.geteuid() == 0 or os.geteuid() != pwd.getpwnam("ecl-deploy").pw_uid:
        raise UpdateError("Run the pull updater as ecl-deploy, never as root")
    os.umask(0o077)
    with open(STATE_DIR / "updater.lock", "a") as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            print("Another pull update is running")
            return
        print(Updater().execute(), flush=True)


if __name__ == "__main__":
    try:
        main()
    except UpdateError as error:
        print("Pull update failed: " + str(error), file=sys.stderr)
        sys.exit(1)
    except (OSError, KeyError):
        print("Pull update failed; check installed service account, directories and state.", file=sys.stderr)
        sys.exit(1)
