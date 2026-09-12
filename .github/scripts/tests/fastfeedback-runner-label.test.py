"""Check that the optional build runner remains isolated to the build job."""

from pathlib import Path
import re
import unittest


WORKFLOW = Path(__file__).resolve().parents[2] / "workflows/p2p-workflow-fastfeedback.yaml"


class FastFeedbackRunnerLabelTest(unittest.TestCase):
    def test_build_runner_input_is_optional_and_defaults_to_empty(self):
        workflow = WORKFLOW.read_text()
        match = re.search(
            r"^      build-runner-label:\n"
            r"(?:        .*\n)*?"
            r"        required: false\n"
            r"        type: string\n"
            r"        default: ''$",
            workflow,
            re.MULTILINE,
        )
        self.assertIsNotNone(match)

    def test_build_override_is_used_once_and_other_jobs_keep_runner_label(self):
        workflow = WORKFLOW.read_text()
        build_selection = (
            "runner-label: ${{ inputs.build-runner-label || inputs.runner-label }}"
        )
        ordinary_selection = "runner-label: ${{ inputs.runner-label }}"

        self.assertEqual(workflow.count(build_selection), 1)
        self.assertEqual(workflow.count(ordinary_selection), 6)

        build_job = workflow.split("\n  build:\n", 1)[1].split("\n  security-source-scan:\n", 1)[0]
        self.assertIn(build_selection, build_job)
        self.assertNotIn(ordinary_selection, build_job)


if __name__ == "__main__":
    unittest.main()
