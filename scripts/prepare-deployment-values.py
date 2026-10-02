#!/usr/bin/env python3
"""Prepare target-owned ingress values for the application's Helm deployment."""

import argparse
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile


def ingress_enabled():
    # yq is part of the existing P2P toolchain. JSON preserves boolean types.
    result = subprocess.run(
        ["yq", "-o=json", ".config.ingress.enabled // false", "app.yaml"],
        check=True, capture_output=True, text=True,
    )
    enabled = json.loads(result.stdout)
    if type(enabled) is not bool:
        raise ValueError("config.ingress.enabled must be boolean")
    return enabled


def deployment_values(enabled):
    ingress = {"enabled": enabled}
    context = os.environ.get("CORECTL_CONTEXT", "")
    if enabled and context:
        cluster = os.environ.get("DPLATFORM", "")
        application = os.environ.get("TENANT_NAME") or os.environ.get("P2P_TENANT_NAME", "")
        if not cluster or not application:
            raise ValueError("Ingress resolution requires a deployment cluster and application")
        command = ["corectl", "p2p", "ingress", cluster, "--application", application,
                   "--context", context, "--output", "json"]
        portal_url = os.environ.get("CORECTL_PORTAL_URL")
        if portal_url:
            command.extend(["--url", portal_url])
        result = subprocess.run(command, check=True, capture_output=True, text=True)
        profile = json.loads(result.stdout)
        if not isinstance(profile, dict) or profile.get("enabled") is not True:
            raise ValueError("Resolved ingress does not match enabled application intent")
        if profile.get("mode") not in ("LOCAL_HTTP", "EXISTING_INGRESS"):
            raise ValueError("Resolved ingress mode is unsupported")
        domain = profile.get("baseDomain")
        ingress_class = profile.get("ingressClass")
        label = r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?"
        if (not isinstance(domain, str) or len(domain) > 190 or
                not re.fullmatch(label + r"(?:\." + label + r")+", domain) or
                any(len(part) > 63 for part in domain.split("."))):
            raise ValueError("Resolved ingress base domain is invalid")
        if (not isinstance(ingress_class, str) or len(ingress_class) > 63 or
                not re.fullmatch(label, ingress_class)):
            raise ValueError("Resolved ingress class is invalid")
        ingress.update(domain=domain, className=ingress_class)
    elif enabled:
        domain = os.environ.get("BASE_DOMAIN", "")
        if not domain:
            raise ValueError("Ingress requires BASE_DOMAIN when no Context is selected")
        ingress["domain"] = domain
    else:
        ingress.update(domain="", className="")
    return {"ingress": ingress, "tests": {"ingress": {"enabled": False}, "nft": {"endpoint": "service"}}}


def prepare(output):
    output = Path(output)
    # Failed preparation must not leave an earlier target's values available.
    output.unlink(missing_ok=True)
    values = deployment_values(ingress_enabled())
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = None
    try:
        with tempfile.NamedTemporaryFile(mode="w", dir=output.parent, delete=False) as file:
            temporary = Path(file.name)
            # JSON is also valid YAML; strings never become shell/Make expressions.
            json.dump(values, file, indent=2)
            file.write("\n")
        temporary.replace(output)
    finally:
        if temporary is not None:
            temporary.unlink(missing_ok=True)


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    try:
        prepare(args.output)
    except (ValueError, OSError, subprocess.CalledProcessError) as error:
        # Do not print subprocess bodies, which may contain authentication data.
        message = str(error) if isinstance(error, ValueError) else "Unable to prepare deployment values"
        raise SystemExit(message) from None
