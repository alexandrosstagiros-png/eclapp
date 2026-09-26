"""Public GitHub polling and command boundary tests; no network, root or real Git."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location("ecl_pull_update", Path(__file__).with_name("pull-update.py"))
pull = importlib.util.module_from_spec(spec)
spec.loader.exec_module(pull)
SHA = "a" * 40
NEXT = "b" * 40


def successful_run(sha=SHA, **changes):
    return {"head_sha": sha, "head_branch": "main", "event": "push",
            "head_repository": {"full_name": pull.REPOSITORY}, "run_number": 9,
            "run_attempt": 1, "status": "completed", "conclusion": "success", **changes}


class PullUpdateTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.root = Path(self.directory.name)
        self.state_dir = self.root / "state"
        self.incoming = self.root / "incoming"
        self.releases = self.root / "releases"
        for path in (self.state_dir, self.incoming, self.releases):
            path.mkdir()
        self.current = self.root / "current"
        self.cache = self.root / "cache" / "repo.git"
        self.clock = 10000
        self.refs = [SHA]
        self.runs = [successful_run()]
        self.requests = []
        self.commands = []
        self.healthy = False
        self.deploy_fails = False
        self.fetched_sha = None
        self.api_error = None

    def updater(self):
        return pull.Updater(state_dir=self.state_dir, cache=self.cache, incoming=self.incoming,
                            current=self.current, releases=self.releases, api=self.api,
                            run=self.command, ready=lambda: self.healthy, now=lambda: self.clock)

    def api(self, path):
        self.requests.append(path)
        if self.api_error:
            raise self.api_error
        if path == "git/ref/heads/main":
            sha = self.refs.pop(0) if len(self.refs) > 1 else self.refs[0]
            return {"object": {"sha": sha}}
        self.assertTrue(path.startswith("actions/workflows/ci.yml/runs?"))
        return {"workflow_runs": self.runs}

    def command(self, args, **kwargs):
        self.commands.append(args)
        if args[0] == "/usr/bin/sudo":
            self.assertEqual(args[1:4], ["-n", "--", "/usr/local/sbin/ecl-deploy"])
            sha = args[-1]
            self.assertEqual(Path(args[-2]), self.incoming / (sha + ".tar.gz"))
            self.assertTrue(Path(args[-2]).is_file())
            release = self.releases / sha
            release.mkdir(exist_ok=True)
            if self.deploy_fails:
                (release / "failed.txt").write_text("Inspect before any retry")
                raise pull.UpdateError("Deployment command failed: sudo")
            self.current.unlink(missing_ok=True)
            self.current.symlink_to(release)
            self.healthy = True
        elif "init" in args:
            self.cache.mkdir(parents=True)
        elif "fetch" in args:
            self.assertEqual(args[-2], pull.GIT_URL)
            self.fetched_sha = args[-1]
        elif "rev-parse" in args:
            return self.fetched_sha + "\n"
        elif "archive" in args:
            output = next(value.split("=", 1)[1] for value in args if value.startswith("--output="))
            Path(output).write_bytes(b"synthetic source archive")
        return ""

    def read_state(self):
        return json.loads((self.state_dir / "state.json").read_text())

    def deployed(self):
        return [args for args in self.commands if args[0] == "/usr/bin/sudo"]

    def test_success_uses_fixed_public_source_and_existing_helper_then_skips_unchanged(self):
        self.assertIn("Deployed checked main", self.updater().execute())
        self.assertEqual(self.read_state()["last_success_sha"], SHA)
        self.assertEqual(len(self.requests), 3)
        self.assertEqual(len(self.deployed()), 1)
        self.assertFalse((self.incoming / (SHA + ".tar.gz")).exists())
        self.assertEqual((self.state_dir / "state.json").stat().st_mode & 0o777, 0o600)
        self.commands.clear()
        self.requests.clear()
        self.assertIn("already deployed and healthy", self.updater().execute())
        self.assertEqual(self.requests, ["git/ref/heads/main"])
        self.assertEqual(self.commands, [])

    def test_missing_stale_failed_pending_pr_and_foreign_ci_never_fetch(self):
        cases = [[], [successful_run(sha=NEXT)], [successful_run(conclusion="failure")],
                 [successful_run(status="in_progress", conclusion=None)],
                 [successful_run(event="pull_request")],
                 [successful_run(head_branch="feature")],
                 [successful_run(head_repository={"full_name": "attacker/eclapp"})]]
        for runs in cases:
            with self.subTest(runs=runs):
                self.runs = runs
                self.assertIn("Waiting for successful push CI", self.updater().execute())
                self.assertEqual(self.commands, [])

    def test_latest_failed_attempt_overrules_older_success(self):
        self.runs = [successful_run(), successful_run(run_attempt=2, conclusion="failure")]
        self.assertIn("Waiting for successful push CI", self.updater().execute())
        self.assertEqual(self.commands, [])

    def test_main_change_during_archive_never_deploys(self):
        self.refs = [SHA, NEXT]
        self.assertIn("main changed", self.updater().execute())
        self.assertEqual(self.deployed(), [])
        self.assertFalse((self.incoming / (SHA + ".tar.gz")).exists())
        self.assertFalse((self.state_dir / "state.json").exists())

    def test_failed_release_retries_with_backoff_and_never_deletes_release(self):
        self.deploy_fails = True
        with self.assertRaises(pull.UpdateError):
            self.updater().execute()
        self.assertEqual(self.read_state()["retry_at"], self.clock + 300)
        marker = self.releases / SHA / "failed.txt"
        self.assertTrue(marker.exists())
        self.commands.clear()
        self.clock += 299
        self.assertIn("Waiting before retrying the failed release", self.updater().execute())
        self.assertEqual(self.commands, [])
        self.clock += 1
        with self.assertRaises(pull.UpdateError):
            self.updater().execute()
        self.assertEqual(self.read_state()["failures"], 2)
        self.assertEqual(self.read_state()["retry_at"], self.clock + 600)
        self.assertTrue(marker.exists())

    def test_new_main_does_not_wait_for_old_failure_backoff(self):
        self.deploy_fails = True
        with self.assertRaises(pull.UpdateError):
            self.updater().execute()
        self.deploy_fails = False
        self.refs, self.runs = [NEXT], [successful_run(sha=NEXT)]
        self.clock += 5
        self.assertIn("Deployed checked main " + NEXT, self.updater().execute())
        self.assertTrue((self.releases / SHA / "failed.txt").exists())
        self.assertEqual(self.read_state()["last_success_sha"], NEXT)

    def test_rate_limit_failure_backs_off_without_more_api_calls(self):
        self.api_error = pull.UpdateError("GitHub API unavailable (HTTP 403)", retry_after=3600)
        with self.assertRaises(pull.UpdateError):
            self.updater().execute()
        self.assertEqual(self.read_state()["retry_at"], self.clock + 3600)
        count = len(self.requests)
        self.clock += 300
        self.assertIn("retrying GitHub access", self.updater().execute())
        self.assertEqual(len(self.requests), count)

    def test_success_is_not_recorded_without_health_and_exact_current_link(self):
        original = self.command
        def unhealthy(args, **kwargs):
            result = original(args, **kwargs)
            if args[0] == "/usr/bin/sudo":
                self.healthy = False
            return result
        updater = self.updater()
        updater.run = unhealthy
        with self.assertRaisesRegex(pull.UpdateError, "did not remain ready"):
            updater.execute()
        self.assertNotIn("last_success_sha", self.read_state())

    def test_invalid_sha_cannot_reach_command_boundary(self):
        self.refs = ["a" * 40 + ";touch /tmp/not-allowed"]
        with self.assertRaisesRegex(pull.UpdateError, "invalid main SHA"):
            self.updater().execute()
        self.assertEqual(self.commands, [])

    def test_wrong_fetched_git_object_never_reaches_deploy(self):
        original = self.command
        def wrong_object(args, **kwargs):
            if "rev-parse" in args:
                return NEXT + "\n"
            return original(args, **kwargs)
        updater = self.updater()
        updater.run = wrong_object
        with self.assertRaisesRegex(pull.UpdateError, "does not match checked main"):
            updater.execute()
        self.assertEqual(self.deployed(), [])
        self.assertEqual(self.read_state()["failed_sha"], SHA)

    def test_helper_success_with_wrong_current_symlink_is_not_recorded(self):
        original = self.command
        def wrong_current(args, **kwargs):
            result = original(args, **kwargs)
            if args[0] == "/usr/bin/sudo":
                self.current.unlink()
                self.current.symlink_to(self.releases / NEXT)
            return result
        updater = self.updater()
        updater.run = wrong_current
        with self.assertRaisesRegex(pull.UpdateError, "did not remain ready"):
            updater.execute()
        self.assertNotIn("last_success_sha", self.read_state())


if __name__ == "__main__":
    unittest.main()
