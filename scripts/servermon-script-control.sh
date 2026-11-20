#!/bin/bash
set -euo pipefail

action=${1:-}
if [[ "$action" == probe && $# == 1 ]]; then
    [[ -x /usr/local/libexec/servermon-script-execute ]]
    [[ $(/usr/bin/id -u servermon-script) -gt 0 ]]
    /usr/bin/systemctl show --property=Version --value >/dev/null
    exec /usr/sbin/runuser -u servermon-script -- /usr/local/libexec/servermon-script-execute --runtimes
fi

id=${2:-}
if [[ ! "$id" =~ ^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$ ]]; then
    exit 64
fi
unit="servermon-script-${id}.service"
case "$action" in
    start)
        timeout=${3:-}
        [[ $# == 3 && $timeout =~ ^[1-9][0-9]{0,4}$ && $timeout -le 86400 ]] || exit 64
        [[ $(/usr/bin/id -u servermon-script) -gt 0 ]]
        exec /usr/bin/systemd-run --quiet --pipe --service-type=oneshot --unit="$unit" \
            --uid=servermon-script --gid=servermon-script \
            --property="RuntimeDirectory=servermon-script-$id" --property=RuntimeDirectoryMode=0700 \
            --property="TimeoutStartSec=${timeout}s" --property=TimeoutStopSec=5s \
            --property=KillMode=control-group --property=NoNewPrivileges=yes \
            --property=ProtectSystem=full --property=TasksMax=128 \
            --property=PrivateNetwork=yes --property=SystemCallArchitectures=native \
            --property="RestrictAddressFamilies=AF_INET AF_INET6 AF_NETLINK" \
            --setenv=BASH_ENV=/dev/null --setenv=ENV=/dev/null \
            /usr/local/libexec/servermon-script-execute
        ;;
    inspect)
        [[ $# == 2 ]] || exit 64
        # systemctl exits nonzero for a missing unit. Its LoadState is still authoritative.
        if output=$(/usr/bin/systemctl show --property=LoadState,ActiveState,Result,ExecMainCode,ExecMainStatus "$unit"); then
            printf '%s\n' "$output"
        elif [[ $output == *LoadState=not-found* ]]; then
            printf 'LoadState=not-found\n'
        else
            exit 1
        fi
        ;;
    stop)
        [[ $# == 2 ]] || exit 64
        exec /usr/bin/systemctl stop "$unit"
        ;;
    forget)
        [[ $# == 2 ]] || exit 64
        exec /usr/bin/systemctl reset-failed "$unit"
        ;;
    *)
        exit 64
        ;;
esac
