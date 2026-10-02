import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.dont_write_bytecode = True
spec = importlib.util.spec_from_file_location("values", "scripts/prepare-deployment-values.py")
values = importlib.util.module_from_spec(spec)
spec.loader.exec_module(values)


class DeploymentValuesTest(unittest.TestCase):
    def test_shared_make_prepares_values_with_real_yaml_parser(self):
        root = Path.cwd()
        with tempfile.TemporaryDirectory() as directory:
            work = Path(directory)
            (work / "app.yaml").write_text("config:\n  ingress:\n    enabled: true\n")
            (work / "curl").write_text('#!/bin/bash\ncp "$HELPER" "${@: -1}"\n')
            (work / "corectl").write_text('#!/bin/bash\nprintf \'%s\\n\' \'{"enabled":true,"mode":"LOCAL_HTTP","baseDomain":"trial.localhost","ingressClass":"traefik"}\'\n')
            for name in ("curl", "corectl"):
                (work / name).chmod(0o755)
            env = dict(os.environ, PATH=directory + ":" + os.environ["PATH"],
                       HELPER=str(root / "scripts/prepare-deployment-values.py"),
                       CORECTL_CONTEXT="core-platform/engineering", DPLATFORM="trial", TENANT_NAME="hello",
                       P2P_VERSION="test", MAKEFLAGS="", GNUMAKEFLAGS="", MFLAGS="")
            command = ["make", "-s", "-f", str(root / "p2p.mk"), "p2p-prepare-deployment-values"]
            result = subprocess.run(command, cwd=work, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            output = work / ".p2p-deployment-values.yaml"
            self.assertEqual(json.loads(output.read_text())["ingress"]["className"], "traefik")
            for override in ("CORECTL_CONTEXT=", "BASE_DOMAIN=other.example", "P2P_INGRESS_CLASS=nginx"):
                result = subprocess.run(command + [override], cwd=work, env=env, capture_output=True, text=True)
                self.assertNotEqual(result.returncode, 0, override)
            (work / "app.yaml").write_text('config:\n  ingress:\n    enabled: "true"\n')
            result = subprocess.run(command, cwd=work, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)
            self.assertFalse(output.exists())

    def run_prepare(self, enabled=True, mode="LOCAL_HTTP", response=None, fail=False, context=True):
        calls = []

        def run(command, **kwargs):
            calls.append(command)
            if command[0] == "yq":
                return subprocess.CompletedProcess(command, 0, json.dumps(enabled))
            if fail:
                raise subprocess.CalledProcessError(1, command, stderr="private response")
            profile = response if response is not None else {
                "enabled": True, "mode": mode, "baseDomain": "trial.localhost",
                "ingressClass": "traefik", "generation": "registration", "revision": 3,
            }
            return subprocess.CompletedProcess(command, 0, json.dumps(profile))

        env = {"CORECTL_CONTEXT": "core-platform/engineering" if context else "",
               "DPLATFORM": "trial", "TENANT_NAME": "hello", "BASE_DOMAIN": "legacy.example.com",
               "CORECTL_PORTAL_URL": "https://portal.example.com"}
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, env, clear=True), \
                patch.object(values.subprocess, "run", side_effect=run):
            output = Path(directory) / "values.yaml"
            output.write_text("stale values")
            try:
                values.prepare(output)
                return json.loads(output.read_text()), calls
            except Exception:
                self.assertFalse(output.exists(), "Failed resolution left stale deployment values")
                raise

    def test_profiles_preserve_ingress_with_service_tests(self):
        for mode in ("LOCAL_HTTP", "EXISTING_INGRESS"):
            with self.subTest(mode=mode):
                result, calls = self.run_prepare(mode=mode)
                self.assertEqual(result["ingress"], {"enabled": True, "domain": "trial.localhost", "className": "traefik"})
                self.assertEqual(result["tests"], {"ingress": {"enabled": False}, "nft": {"endpoint": "service"}})
                self.assertEqual(calls[1], ["corectl", "p2p", "ingress", "trial", "--application", "hello",
                                           "--context", "core-platform/engineering", "--output", "json",
                                           "--url", "https://portal.example.com"])

    def test_disabled_needs_no_lookup_and_clears_previous_ingress(self):
        result, calls = self.run_prepare(enabled=False)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["ingress"], {"enabled": False, "domain": "", "className": ""})

    def test_legacy_retains_domain_but_uses_service_tests(self):
        result, calls = self.run_prepare(context=False)
        self.assertEqual(len(calls), 1)
        self.assertEqual(result["ingress"]["domain"], "legacy.example.com")
        self.assertEqual(result["tests"]["nft"]["endpoint"], "service")

    def test_lookup_failure_removes_stale_file(self):
        with self.assertRaises(subprocess.CalledProcessError):
            self.run_prepare(fail=True)

    def test_non_boolean_intent_is_rejected(self):
        for enabled in ("true", "false", 1, None):
            with self.subTest(enabled=enabled), self.assertRaises(ValueError):
                self.run_prepare(enabled=enabled)

    def test_invalid_profile_is_rejected(self):
        profile = {"enabled": True, "mode": "LOCAL_HTTP", "baseDomain": "trial.localhost", "ingressClass": "traefik"}
        for field, value in (("enabled", False), ("mode", "UNKNOWN"), ("baseDomain", "$(touch bad)"),
                             ("baseDomain", "http://trial.localhost:8088"), ("ingressClass", "nginx;echo bad")):
            with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                self.run_prepare(response={**profile, field: value})


if __name__ == "__main__":
    unittest.main()
