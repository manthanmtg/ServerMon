#!/bin/bash
set -euo pipefail
umask 077

IFS= read -r -d '' directory
IFS= read -r -d '' count
[[ $directory == /* && $count =~ ^([0-9]|1[0-9]|20)$ ]]
arguments=()
for ((i = 0; i < count; i++)); do
    IFS= read -r -d '' argument
    arguments+=("$argument")
done

source_path="${RUNTIME_DIRECTORY:?Missing run directory}/script.sh"
/bin/cat > "$source_path"
if ! cd -- "$directory"; then
    printf 'Script Runner could not enter the working directory as servermon-script.\n' >&2
    exit 125
fi

exec /usr/bin/env -i PATH=/usr/local/bin:/usr/bin:/bin LANG=C.UTF-8 \
    HOME=/var/lib/servermon-script USER=servermon-script LOGNAME=servermon-script \
    /bin/bash --noprofile --norc "$source_path" "${arguments[@]}" </dev/null
