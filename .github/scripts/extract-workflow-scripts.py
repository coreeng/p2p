#!/usr/bin/env python3
from argparse import ArgumentParser
from pathlib import Path


def extract_script(workflow, step_id):
    lines = workflow.read_text().splitlines()
    in_step = False
    in_script = False
    script = []
    step_prefix = f"      - id: {step_id}"

    for line in lines:
        if line.startswith(step_prefix):
            in_step = True
            continue
        if in_step and line.startswith("      - id: "):
            break
        if in_step and line.strip() == "script: |":
            in_script = True
            continue
        if in_script:
            if line.startswith("            "):
                script.append(line[12:])
            elif line.strip() == "":
                script.append("")
            else:
                break

    if not script:
        raise SystemExit(f"Could not extract {step_id} script")
    return "\n".join(script) + "\n"


def main():
    parser = ArgumentParser()
    parser.add_argument("--workflow", required=True, type=Path)
    parser.add_argument("--out-dir", required=True, type=Path)
    parser.add_argument("--step", action="append", default=[], help="step-id=filename")
    parser.add_argument("--require", action="append", default=[], help="step-id=marker")
    args = parser.parse_args()

    scripts = {}
    for spec in args.step:
        step_id, filename = spec.split("=", 1)
        scripts[step_id] = extract_script(args.workflow, step_id)
        output = args.out_dir / filename
        output.write_text(scripts[step_id])

    for spec in args.require:
        step_id, marker = spec.split("=", 1)
        if step_id not in scripts:
            raise SystemExit(f"No extracted script for required marker step: {step_id}")
        if marker not in scripts[step_id]:
            raise SystemExit(f"Extracted {step_id} script is missing expected marker: {marker}")


if __name__ == "__main__":
    main()
