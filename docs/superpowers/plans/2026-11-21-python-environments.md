# Python Environments implementation

Add a Linux-first Python Environments module with dependency builds, revision rollback, storage accounting, and Script Runner integration.

1. Define host-scoped environment records and bounded revision metadata. Queue updates atomically with the environment. Expose authenticated inventory, detail, create, build, restore, and delete routes.
2. Run the environment worker loop alongside the existing flock-protected Script Runner worker. Install packages in an isolated, unprivileged systemd unit. Build in the final revision directory, validate dependencies, then publish the revision with an atomic metadata update. Recover interrupted builds and retain the active revision, one rollback revision, and any revisions referenced by active runs.
3. Add the standalone page, navigation, module widget, and environment detail with requirements, packages, consumers, build logs, revision storage, and rollback.
4. Add a worker launch protocol for a managed Python interpreter. Validate environment references before saving a script. Resolve the active revision at queue time and store it in the run snapshot. Validate replay against the recorded revision. Use the existing link mutation lock to coordinate run and script references with environment deletion and revision pruning.
5. Verify dependency validation, failed updates, revision retention, queued and scheduled use, replay, and the installer contract. Run the repository checks and exercise the UI against an isolated database.

## uv integration

Use a pinned, checksum-verified uv binary in the same unprivileged build unit. Build each revision with an explicit Python interpreter, compile a hash-locked requirements file, and sync it before verification. Keep the lock in its revision directory. Add a durable worker job and UI for explicitly installing exact CPython versions under the shared interpreter root, and list available managed versions alongside the installed host interpreters. Exercise the Script Runner picker in both saved defaults and one-off run configuration.
