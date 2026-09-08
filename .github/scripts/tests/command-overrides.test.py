"""Exercise the resolver embedded in the reusable workflow, without cloud access."""
import os
from pathlib import Path
import subprocess
import tempfile
import textwrap
import unittest


WORKFLOW = Path(__file__).resolve().parents[2] / "workflows/p2p-execute-command.yaml"
SOURCE = textwrap.dedent(
    WORKFLOW.read_text().split("python3 - <<'PY'\n", 1)[1].split("          PY\n", 1)[0]
)


class CommandOverridesTest(unittest.TestCase):
    def resolve(self, commands, command="p2p-build"):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / "output"
            result = subprocess.run(
                ["python3", "-c", SOURCE],
                env={**os.environ, "COMMAND": command, "COMMAND_OVERRIDES": commands,
                     "GITHUB_OUTPUT": str(output)},
                capture_output=True, text=True,
            )
            return result, output.read_text() if output.exists() else ""

    def test_selection(self):
        for commands, command, expected in [
            ("", "p2p-build", "false"),
            ("p2p-build", "p2p-build", "true"),
            ("p2p-build", "p2p-functional", "false"),
            (" p2p-build, p2p-functional ", "p2p-functional", "true"),
            ("", "custom-make-target", "false"),
        ]:
            with self.subTest(commands=commands, command=command):
                result, output = self.resolve(commands, command)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual(output, f"overridden={expected}\n")

    def test_invalid_configuration_fails_without_selection(self):
        for commands in [" ", ",", "p2p-build,", "p2p-build,,p2p-nft",
                         "p2p-buid", "p2p-build,p2p-build", "p2p-build, p2p-build",
                         "$(touch unexpected)"]:
            with self.subTest(commands=commands):
                result, output = self.resolve(commands)
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(output, "")


if __name__ == "__main__":
    unittest.main()
