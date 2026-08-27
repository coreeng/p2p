import re
from pathlib import Path


executor = Path(".github/workflows/p2p-execute-command.yaml").read_text()
fast_feedback = Path(".github/workflows/p2p-workflow-fastfeedback.yaml").read_text()


def runner_input(workflow: str) -> str:
    match = re.search(r"(?m)^      runner-label:\n((?:        .*\n)+)", workflow)
    assert match is not None, "workflow must declare the runner-label input"
    return match.group(1)


assert "type: string" in runner_input(executor)
assert "default: ''" in runner_input(executor)
assert (
    "runs-on: ${{ inputs.runner-label || vars.P2P_RUNNER_LABEL || 'ubuntu-24.04' }}"
    in executor
), "executor must resolve explicit, configured, then native runner labels"

assert "type: string" in runner_input(fast_feedback)
assert "default: ''" in runner_input(fast_feedback)
assert (
    fast_feedback.count("runner-label: ${{ inputs.runner-label }}") == 4
), "fast-feedback must pass runner-label to all four command jobs"
