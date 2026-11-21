#!/usr/bin/python3 -I
"""Execute one Script Runner payload under the unprivileged systemd account."""

import base64
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

RUNTIME_PATH = "/usr/local/bin:/usr/bin:/bin"
RUNTIMES = {"bash": "bash", "python": "python3", "node": "node"}
FILENAMES = {"bash": "script.sh", "python": "script.py", "node": "script.cjs"}
MAX_PAYLOAD = 2 * 1024 * 1024
MAX_ATTACHMENTS = 16
MAX_ATTACHMENT_BYTES = 512 * 1024
NAME = re.compile(r"[A-Za-z_][A-Za-z0-9_]{0,127}")
INVALID_FILENAME = re.compile(r"[/\\\x00-\x1f\x7f-\x9f]")
UUID = re.compile(r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")
PYTHON_ENV_ROOT = Path("/var/lib/servermon/python-environments")


def runtimes():
    paths = {name: shutil.which(binary, path=RUNTIME_PATH) for name, binary in RUNTIMES.items()}
    return {name: path for name, path in paths.items() if path is not None}


def read_attachments(parts):
    count = int(next(parts))
    if not 1 <= count <= MAX_ATTACHMENTS:
        raise ValueError
    attachments = {}
    total = 0
    for _ in range(count):
        raw_name = next(parts)
        name = raw_name.decode("utf-8")
        if (
            len(raw_name) > 255
            or name in ("", ".", "..")
            or INVALID_FILENAME.search(name)
            or name in attachments
        ):
            raise ValueError
        content = base64.b64decode(next(parts), validate=True)
        total += len(content)
        if total > MAX_ATTACHMENT_BYTES:
            raise ValueError
        attachments[name] = content
    return attachments


def read_payload():
    payload = sys.stdin.buffer.read(MAX_PAYLOAD + 1)
    if len(payload) > MAX_PAYLOAD:
        raise ValueError
    parts = iter(payload.split(b"\0"))
    version = next(parts)
    with_attachments = version == b"script-runner-v4"
    enhanced = with_attachments or version in (b"script-runner-v2", b"script-runner-v3")
    language = os.fsdecode(next(parts)) if enhanced else "bash"
    python_environment = None
    if with_attachments or version == b"script-runner-v3":
        environment_id = os.fsdecode(next(parts))
        revision_id = os.fsdecode(next(parts))
        if not with_attachments or environment_id or revision_id:
            if language != "python" or not UUID.fullmatch(environment_id) or not UUID.fullmatch(revision_id):
                raise ValueError
            python_environment = PYTHON_ENV_ROOT / environment_id / revision_id
    cwd = os.fsdecode(next(parts) if enhanced else version)
    argument_count = int(next(parts))
    if not cwd.startswith("/") or not 0 <= argument_count <= 20:
        raise ValueError
    args = [os.fsdecode(next(parts)) for _ in range(argument_count)]

    env = {
        "PATH": RUNTIME_PATH,
        "LANG": "C.UTF-8",
        "HOME": "/var/lib/servermon-script",
        "USER": "servermon-script",
        "LOGNAME": "servermon-script",
    }
    if enhanced:
        variable_count = int(next(parts))
        if not 0 <= variable_count <= 32:
            raise ValueError
        names = set()
        for _ in range(variable_count):
            name, value = os.fsdecode(next(parts)), os.fsdecode(next(parts))
            if not NAME.fullmatch(name) or name in names:
                raise ValueError
            names.add(name)
            env[name] = value

    attachments = read_attachments(parts) if with_attachments else {}
    source = next(parts)
    if next(parts, None) is not None:
        raise ValueError
    return language, cwd, args, env, source, python_environment, attachments


def stage_attachments(runtime_directory, language, source, attachments):
    # systemd removes the run's RuntimeDirectory when the service exits.
    directory = Path(tempfile.mkdtemp(dir=runtime_directory))
    for name, content in attachments.items():
        with (directory / name).open("xb") as attachment:
            attachment.write(content)
    with tempfile.NamedTemporaryFile(
        dir=directory, prefix="script-", suffix=Path(FILENAMES[language]).suffix, delete=False
    ) as script:
        script.write(source)
        return Path(script.name)


def execute():
    try:
        language, cwd, args, env, source, python_environment, attachments = read_payload()
    except (ValueError, StopIteration):
        sys.exit("Invalid Script Runner launch payload.")

    if python_environment:
        binary = str(python_environment / "bin" / "python")
        if not os.access(binary, os.X_OK):
            sys.exit("The recorded Python environment revision is unavailable.")
        env["VIRTUAL_ENV"] = str(python_environment)
        env["PATH"] = str(python_environment / "bin") + os.pathsep + env["PATH"]
        env.pop("PYTHONHOME", None)
    else:
        binary = runtimes().get(language)
    if not binary:
        print("The requested script runtime is not installed.", file=sys.stderr)
        sys.exit(127)

    os.umask(0o077)
    runtime_directory = Path(os.environ["RUNTIME_DIRECTORY"])
    if attachments:
        try:
            source_path = stage_attachments(runtime_directory, language, source, attachments)
            cwd = source_path.parent
        except OSError:
            print("Script Runner could not prepare the attachments directory.", file=sys.stderr)
            sys.exit(125)
    try:
        os.chdir(cwd)
    except OSError:
        print("Script Runner could not enter the working directory as servermon-script.", file=sys.stderr)
        sys.exit(125)

    if not attachments:
        source_path = runtime_directory / FILENAMES[language]
        source_path.write_bytes(source)

    # Stdin mode allows Python and Node to resolve local imports from the chosen directory.
    if language == "bash":
        command = [binary, "--noprofile", "--norc", str(source_path), *args]
        input_path = os.devnull
    elif attachments:
        runtime_args = ["-u"] if language == "python" else []
        command = [binary, *runtime_args, str(source_path), *args]
        input_path = os.devnull
    elif language == "python":
        command = [binary, "-u", "-", *args]
        input_path = source_path
    else:
        command = [binary, "--input-type=commonjs", "-", *args]
        input_path = source_path

    with open(input_path, "rb") as script_input:
        os.dup2(script_input.fileno(), 0)
        os.execve(binary, command, env)


if __name__ == "__main__":
    if sys.argv[1:] == ["--runtimes"]:
        print("script-runner-v2", *runtimes(), "python-environments-v1", "attachments-v1", sep="\n")
    elif len(sys.argv) == 1:
        execute()
    else:
        sys.exit("Invalid Script Runner invocation.")
