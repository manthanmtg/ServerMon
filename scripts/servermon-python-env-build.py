#!/usr/bin/python3 -I
"""Build or inspect a virtual environment inside an unprivileged transient unit."""

import importlib.metadata
import json
import os
import platform
import re
import subprocess
import sys
from pathlib import Path

NAME = r"[A-Za-z0-9](?:[A-Za-z0-9_.-]*[A-Za-z0-9])?"
VERSION = r"(?:===|==|~=|!=|<=|>=|<|>)\s*[A-Za-z0-9*][A-Za-z0-9._+!*-]*"
REQUIREMENT = re.compile(
    rf"{NAME}(?:\[\s*{NAME}(?:\s*,\s*{NAME})*\s*\])?(?:\s*{VERSION}(?:\s*,\s*{VERSION})*)?"
)


def uv_command(uv, *args):
    subprocess.run(
        [uv, "--no-config", "--no-cache", "--no-python-downloads", "--no-progress", *args],
        stdout=sys.stderr, check=True,
    )


def install(target, interpreter, uv):
    data = sys.stdin.buffer.read(32769)
    if len(data) > 32768:
        sys.exit("Requirements file is too large.")
    requirements = data.decode("utf-8").splitlines()
    if len(requirements) > 128 or any(
        len(line) > 256 or not REQUIREMENT.fullmatch(line) for line in requirements
    ):
        sys.exit("Requirements must name packages from the approved package index.")

    target = Path(target).resolve()
    interpreter = Path(interpreter).resolve(strict=True)
    uv_command(uv, "venv", "--python", str(interpreter), str(target))

    lock = target / "requirements.lock"
    if not requirements:
        lock.touch()
        return
    print("SERVERMON_STAGE installing", flush=True)
    manifest = Path(os.environ["RUNTIME_DIRECTORY"]) / "requirements.in"
    manifest.write_text("\n".join(requirements), encoding="utf-8")
    python = str(target / "bin" / "python")
    index = ("--index-url", "https://pypi.org/simple", "--only-binary", ":all:")
    uv_command(
        uv, "pip", "compile", "--python", python, "--generate-hashes", "--no-header", "--no-annotate",
        "--output-file", str(lock), *index, str(manifest),
    )
    uv_command(
        uv, "pip", "sync", "--python", python, "--require-hashes", "--link-mode", "copy",
        *index, str(lock),
    )


def inspect(uv):
    uv_command(uv, "pip", "check", "--offline", "--python", sys.executable)
    packages = sorted(
        [
            {"name": pkg.metadata["Name"], "version": pkg.version}
            for pkg in importlib.metadata.distributions()
        ],
        key=lambda pkg: (pkg["name"] or "").lower(),
    )
    if len(packages) > 2048 or any(
        not all(isinstance(value, str) and 0 < len(value) <= 128 for value in pkg.values())
        for pkg in packages
    ):
        sys.exit("Installed package metadata exceeds the supported limits.")
    print("SERVERMON_RESULT " + json.dumps(
        {"pythonVersion": platform.python_version(), "packages": packages}
    ), flush=True)


if __name__ == "__main__":
    if len(sys.argv) == 5 and sys.argv[1] == "install":
        install(sys.argv[2], sys.argv[3], sys.argv[4])
    elif len(sys.argv) == 3 and sys.argv[1] == "inspect":
        inspect(sys.argv[2])
    else:
        sys.exit("Invalid environment builder invocation.")
