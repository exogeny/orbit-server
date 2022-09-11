#!/usr/bin/env bash

if [[ "$OSTYPE" == "darwin"* ]]; then
  realpath() { [[ $1 = /* ]] && echo "$1" || echo "$PWD/${1#./}"; }
  ROOT=$(dirname $(dirname $(realpath "$0")))
else
  ROOT=$(dirname $(dirname $(readlink -f $0)))
fi

function start() {
  if [[ -z "${ORBIT_SKIP_PRELAUNCH}" ]]; then
    node build/lib/preLaunch.js
  fi

  NODE=$(node scripts/node.js)
  if [ ! -e $NODE ];then
    yarn gulp node
  fi

  NODE_ENV=development \
  $NODE $ROOT/scripts/start-server.js "$@"
}

start "$@"