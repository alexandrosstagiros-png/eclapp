"""Local checks for archive boundaries and generated public configuration; no root/network."""
import base64
import hashlib
import importlib.util
import io
from pathlib import Path
import tarfile
import tempfile
import unittest


def load(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).parent/filename)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


deploy = load("ecl_deploy", "deploy.py")
nginx = load("ecl_nginx", "configure-nginx.py")


def archive_of(entries):
    output = io.BytesIO()
    with tarfile.open(fileobj=output, mode="w:gz") as archive:
        for entry in entries:
            if isinstance(entry, tuple):
                name, data = entry
                entry = tarfile.TarInfo(name)
                entry.size = len(data)
                archive.addfile(entry, io.BytesIO(data))
            else:
                archive.addfile(entry)
    output.seek(0)
    return output


class ArchiveTests(unittest.TestCase):
    def assert_rejected(self, entries):
        with tarfile.open(fileobj=archive_of(entries), mode="r:gz") as archive:
            with self.assertRaises(ValueError):
                deploy.safe_members(archive)

    def test_traversal_and_absolute_paths_rejected(self):
        for name in ("../etc/cron.d/ecl", "/etc/cron.d/ecl", "recovered/../../etc/ecl/app.env", "recovered\\..\\evil"):
            with self.subTest(name=name):
                self.assert_rejected([(name,b"evil")])

    def test_links_and_devices_rejected(self):
        for kind in (tarfile.SYMTYPE, tarfile.LNKTYPE, tarfile.CHRTYPE, tarfile.FIFOTYPE):
            member = tarfile.TarInfo("recovered/evil")
            member.type = kind
            member.linkname = "/etc"
            with self.subTest(kind=kind):
                self.assert_rejected([member])

    def test_duplicates_and_local_secrets_rejected(self):
        self.assert_rejected([("same",b"1"),("same",b"2")])
        for name in (".env", "recovered/.env.production", ".git/config", "recovered/node_modules/x", "recovered/.local/data"):
            self.assert_rejected([(name,b"secret")])

    def test_full_repository_unpack_and_incomplete_archive(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            source = root/"source.tar.gz"
            source.write_bytes(archive_of([(x,b"{}") for x in ("recovered/package.json", "recovered/package-lock.json", "recovered/scripts/migrate.cjs")]+[("docs/note.txt",b"ok")]).read())
            target = root/"extract"
            target.mkdir()
            deploy.unpack(source,target)
            self.assertEqual((target/"docs/note.txt").read_text(),"ok")
            source.write_bytes(archive_of([("README.md",b"incomplete")]).read())
            with self.assertRaises(ValueError):
                deploy.unpack(source,root/"incomplete")

    def test_github_archive_metadata_and_dotgithub_allowed(self):
        with tarfile.open(fileobj=archive_of([(".github/workflows/ci.yml",b"name: ci"),(".gitignore",b".env")]),mode="r:gz") as archive:
            self.assertEqual(len(deploy.safe_members(archive)),2)


class NginxTests(unittest.TestCase):
    def test_acme_only_does_not_publish_application(self):
        config = nginx.render("161.104.109.191")
        self.assertIn("/.well-known/acme-challenge/",config)
        self.assertIn("return 503",config)
        self.assertNotIn("proxy_pass",config)
        self.assertNotIn("/opt/ecl",config)

    def test_injection_rejected(self):
        for hostname in ("example.com; include /tmp/evil;", "example.com\n", "bad..name"):
            with self.assertRaises(ValueError):
                nginx.render(hostname)
        with self.assertRaises(ValueError):
            nginx.render("example.com","/etc/cert.pem; include /tmp/evil", "/etc/key.pem")

    def test_https_configuration_restricts_files_and_upstream(self):
        config = nginx.render("example.com","/etc/cert/fullchain.pem","/etc/cert/privkey.pem")
        self.assertIn("client_max_body_size 36m",config)
        self.assertIn("proxy_pass http://127.0.0.1:3001",config)
        self.assertIn("proxy_set_header X-Forwarded-For $remote_addr",config)
        self.assertIn("location / { return 404; }",config)
        self.assertIn("root /var/www/ecl;",config)
        self.assertNotIn("$proxy_add_x_forwarded_for",config)

    def test_csp_hash_matches_actual_inline_bytes(self):
        inline = b"document.documentElement.dataset.theme='dark';"
        policy = deploy.csp_text(b"<html><script>"+inline+b"</script></html>")
        digest = base64.b64encode(hashlib.sha256(inline).digest()).decode()
        self.assertIn("'sha256-"+digest+"'",policy)
        self.assertIn("https://*.telegram.org https://max.ru https://*.max.ru",policy)
        for html in (b"<html></html>",b"<script>x</script><script>y</script>"):
            with self.assertRaises(ValueError):
                deploy.csp_text(html)


if __name__ == "__main__":
    unittest.main()
