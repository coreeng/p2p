#!/usr/bin/env python3

from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[3]
WORKFLOW_PATH = ROOT / ".github/workflows/pinniped-auth-evidence.yaml"


class PinnipedAuthEvidenceWorkflowTest(unittest.TestCase):
    def setUp(self) -> None:
        self.assertTrue(WORKFLOW_PATH.is_file(), f"missing workflow: {WORKFLOW_PATH}")
        self.workflow = WORKFLOW_PATH.read_text()

    def test_has_restricted_triggers_permissions_and_job(self) -> None:
        workflow = self.workflow
        self.assertIn("name: Pinniped Authentication Evidence", workflow)
        self.assertRegex(
            workflow,
            r"(?ms)^on:\n"
            r"  workflow_dispatch:\n"
            r"  push:\n"
            r"    branches:\n"
            r"      - spike/pinniped-sandbox\n\n"
            r"permissions:\n"
            r"  contents: read\n"
            r"  id-token: write\n",
        )
        self.assertRegex(
            workflow,
            r"(?ms)^  wrong-repository:\n"
            r"    runs-on: ubuntu-24\.04\n"
            r"    environment: sandbox-3-gcp\n"
            r"    timeout-minutes: 10\n",
        )
        jobs = workflow[workflow.index("jobs:\n") + len("jobs:\n") :]
        self.assertEqual(
            re.findall(r"^  ([A-Za-z0-9_-]+):\n", jobs, re.MULTILINE),
            ["wrong-repository"],
        )

    def test_installs_the_checksum_verified_cli(self) -> None:
        workflow = self.workflow
        self.assertIn("uses: actions/checkout@v6", workflow)
        self.assertIn(
            "https://get.pinniped.dev/v0.47.0/pinniped-cli-linux-amd64",
            workflow,
        )
        self.assertIn(
            "43538ad0c9c9ad67fb121f3d1e8d174324b9fea63f07ec88936182889df752a6",
            workflow,
        )
        self.assertIn("curl", workflow)
        self.assertIn("sha256sum --check", workflow)
        self.assertIn("sudo install", workflow)

    def test_runs_wrong_repository_rejection_with_step_local_configuration(self) -> None:
        workflow = self.workflow
        match = re.search(
            r"(?ms)^      - name: Verify wrong repository rejection\n(?P<body>.*?)(?=^      - name: |\Z)",
            workflow,
        )
        if match is None:
            self.fail("missing evidence runner step")
        step = match.group(0)
        self.assertIn("PINNIPED_ENDPOINT: ${{ vars.PINNIPED_ENDPOINT }}", step)
        self.assertIn("PINNIPED_CA_BUNDLE: ${{ vars.PINNIPED_CA_BUNDLE }}", step)
        self.assertEqual(workflow.count("PINNIPED_ENDPOINT:"), 1)
        self.assertEqual(workflow.count("vars.PINNIPED_ENDPOINT"), 1)
        self.assertEqual(workflow.count("PINNIPED_CA_BUNDLE:"), 1)
        self.assertEqual(workflow.count("vars.PINNIPED_CA_BUNDLE"), 1)
        self.assertIn(".github/scripts/pinniped-auth-evidence", step)
        self.assertIn(
            "--audience=core-platform:sandbox-3-gcp:auth-test-2", step
        )
        self.assertIn("--authenticator=github-actions-auth-test-2", step)
        self.assertIn("--expect-authentication=rejected", step)

        before_steps = workflow[: workflow.index("    steps:")]
        self.assertNotIn("PINNIPED_ENDPOINT", before_steps)
        self.assertNotIn("PINNIPED_CA_BUNDLE", before_steps)

    def test_does_not_expose_sensitive_data_or_use_cloud_auth_or_artifacts(self) -> None:
        workflow = self.workflow
        for forbidden in (
            "google-github-actions/",
            "upload-artifact",
            "cat $KUBECONFIG",
            'cat "$KUBECONFIG"',
            "echo $PINNIPED_CA_BUNDLE",
            'echo "$PINNIPED_CA_BUNDLE"',
            "echo ${PINNIPED_CA_BUNDLE}",
            'echo "${PINNIPED_CA_BUNDLE}"',
        ):
            self.assertNotIn(forbidden, workflow)


if __name__ == "__main__":
    unittest.main()
