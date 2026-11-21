#!/bin/bash
set -euo pipefail

root=/var/lib/servermon/python-environments
interpreters=/var/lib/servermon/python-interpreters
uv=/usr/local/libexec/servermon-uv
builder=servermon-python
helper=/usr/local/libexec/servermon-python-env-build
uuid='^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
action=${1:-}
version_pattern='^3\.(0|[1-9][0-9]{0,2})\.(0|[1-9][0-9]{0,2})$'

managed_ready() {
    local path=$1
    [[ ! -L $path && -f $path/.servermon-ready && ! -L $path/.servermon-ready &&
       $(/usr/bin/stat -c %u -- "$path/.servermon-ready") == 0 && -x $path/python ]]
}

seal_tree() {
    local path=$1 executable=$2 data=$3 python=${4:-} link destination unsafe
    while IFS= read -r -d '' link; do
        destination=$(/usr/bin/realpath -e -- "$link")
        if [[ $destination != "$path/"* ]]; then
            [[ $destination == "$python" && ${link%/*} == "$path/bin" &&
               ${link##*/} =~ ^python(3(\.[0-9]{1,3})?)?$ ]] || return 65
        fi
    done < <(/usr/bin/find -P "$path" -xdev -type l -print0)
    unsafe=$(/usr/bin/find -P "$path" -xdev \( -type f -links +1 -o ! \( -type d -o -type f -o -type l \) \) -print -quit)
    [[ -z $unsafe ]] || return 65
    /usr/bin/chown -hRP root:servermon-script "$path"
    /usr/bin/find -P "$path" -xdev -type d -exec /usr/bin/chmod "$executable" -- {} +
    /usr/bin/find -P "$path" -xdev -type f -perm /111 -exec /usr/bin/chmod "$executable" -- {} +
    /usr/bin/find -P "$path" -xdev -type f ! -perm /111 -exec /usr/bin/chmod "$data" -- {} +
}

stop_unit() {
    local name=$1 state
    state=$(/usr/bin/systemctl show --property=LoadState --value "$name") || [[ $state == not-found ]]
    if [[ $state != not-found ]]; then
        /usr/bin/systemctl stop "$name"
        /usr/bin/systemctl reset-failed "$name" 2>/dev/null || true
    fi
}

build_properties() {
    local path=$1
    props=(
        --quiet --pipe --wait --collect --service-type=oneshot --uid="$builder" --gid="$builder"
        --property=ProtectSystem=strict --property=ProtectHome=yes --property=PrivateTmp=yes
        --property=PrivateDevices=yes --property=NoNewPrivileges=yes --property=KillMode=control-group
        --property=TasksMax=128 --property=MemoryMax=1G --property=TimeoutStartSec=600s
        --property=RestrictSUIDSGID=yes --property=ProtectKernelTunables=yes --property=ProtectKernelModules=yes
        --property="ReadWritePaths=$path" --property="WorkingDirectory=$path"
        --property="InaccessiblePaths=-/etc/servermon -/var/lib/servermon-script -/var/lib/servermon/script-runner"
        --setenv="HOME=$path" --setenv=LANG=C.UTF-8 --setenv=PATH=/usr/bin:/bin
    )
}

if [[ $action == install-python ]]; then
    version=${2:-}
    [[ $# == 2 && $version =~ $version_pattern && -x $uv && -d $interpreters && ! -L $interpreters ]] || exit 64
    [[ $(/usr/bin/id -u "$builder") -gt 0 ]]
    target="$interpreters/$version"
    [[ ! -L $target ]] || exit 65
    if managed_ready "$target"; then
        exit 0
    fi

    unit="servermon-python-interpreter-$version.service"
    stop_unit "$unit"
    /usr/bin/rm -rf --one-file-system -- "$target"
    /usr/bin/install -d -m 0700 -o "$builder" -g "$builder" "$target"
    build_properties "$target"
    /usr/bin/systemd-run "${props[@]}" --unit="$unit" \
        "$uv" --no-config --no-cache --no-progress python install --no-bin --install-dir "$target" "cpython@$version" </dev/null
    shopt -s nullglob
    candidates=("$target"/cpython-"$version"-*/bin/python3)
    [[ ${#candidates[@]} == 1 && -x ${candidates[0]} ]] || exit 65
    /usr/bin/ln -s -- "${candidates[0]#"$target/"}" "$target/python"
    # The base interpreter is shared by the builder and Script Runner accounts.
    seal_tree "$target" 0755 0644
    /usr/sbin/runuser -u servermon-script -- /usr/bin/test -x "$target/python"
    /usr/bin/install -m 0444 -o root -g root /dev/null "$target/.servermon-ready"
    exit 0
fi

if [[ $action == probe && $# == 1 ]]; then
    [[ -x $helper && -x $uv && -d $root && -d $interpreters ]]
    [[ $(/usr/bin/id -u "$builder") -gt 0 ]]
    [[ $(/usr/bin/id -u servermon-script) -gt 0 ]]
    /usr/bin/systemctl show --property=Version --value >/dev/null
    for interpreter in /usr/bin/python3 /usr/bin/python3.[0-9] /usr/bin/python3.[0-9][0-9]; do
        [[ -x $interpreter ]] || continue
        if version=$("$interpreter" -I -c 'import importlib.metadata, platform; print(platform.python_version())' 2>/dev/null); then
            printf '%s %s\n' "${interpreter##*/}" "$version"
        fi
    done
    for installation in "$interpreters"/3.*; do
        version=${installation##*/}
        if [[ $version =~ $version_pattern ]] && managed_ready "$installation"; then
            printf 'uv-%s %s\n' "$version" "$version"
        fi
    done
    exit 0
fi

environment=${2:-}
revision=${3:-}
[[ $environment =~ $uuid && $revision =~ $uuid ]] || exit 64
target="$root/$environment/$revision"
unit="servermon-python-$environment-$revision"
[[ ! -L "$root" && ! -L "$root/$environment" && ! -L "$target" ]] || exit 65

case "$action" in
    build)
        interpreter=${4:-}
        [[ $# == 4 && -x $uv ]] || exit 64
        if [[ $interpreter =~ ^python3(\.[0-9]{1,2})?$ && -x /usr/bin/$interpreter ]]; then
            interpreter_path="/usr/bin/$interpreter"
        elif [[ $interpreter == uv-* && ${interpreter#uv-} =~ $version_pattern ]] && managed_ready "$interpreters/${interpreter#uv-}"; then
            interpreter_path="$interpreters/${interpreter#uv-}/python"
        else
            exit 64
        fi
        [[ $(/usr/bin/id -u "$builder") -gt 0 ]]
        /usr/bin/install -d -m 0755 -o root -g root "$root/$environment"
        /usr/bin/mkdir -- "$target"
        /usr/bin/chown "$builder:$builder" "$target"
        /usr/bin/chmod 0700 "$target"
        build_properties "$target"
        /usr/bin/systemd-run "${props[@]}" --unit="$unit-install.service" \
            --property="RuntimeDirectory=$unit" --property=RuntimeDirectoryMode=0700 \
            /usr/bin/python3 -I "$helper" install "$target" "$interpreter_path" "$uv"
        printf 'SERVERMON_STAGE checking\n'
        /usr/bin/systemd-run "${props[@]}" --unit="$unit-check.service" \
            --property=PrivateNetwork=yes --property=TimeoutStartSec=60s \
            "$target/bin/python" -I "$helper" inspect "$uv" </dev/null
        # uv links the environment's Python aliases to the selected base interpreter.
        [[ -x $target/bin/python ]] || exit 65
        seal_tree "$target" 0750 0640 "$(/usr/bin/realpath -e -- "$interpreter_path")"
        /usr/sbin/runuser -u servermon-script -- /usr/bin/test -x "$target/bin/python"
        size=$(/usr/bin/du -sB1 -- "$target")
        printf 'SERVERMON_BYTES %s\n' "${size%%[[:space:]]*}"
        ;;
    stop)
        [[ $# == 3 ]] || exit 64
        stop_unit "$unit-install.service"
        stop_unit "$unit-check.service"
        ;;
    remove)
        [[ $# == 3 ]] || exit 64
        stop_unit "$unit-install.service"
        stop_unit "$unit-check.service"
        /usr/bin/rm -rf --one-file-system -- "$target"
        /usr/bin/rmdir -- "$root/$environment" 2>/dev/null || true
        ;;
    *) exit 64 ;;
esac
