#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
node_bin="$PWD/.tools/node-v24.22.2-linux-x64/bin"
sandbox_bin="$PWD/.tools/near-sandbox-2.13.4"
if [ ! -x "$node_bin/node" ]; then
  echo 'Install local Node first: bash work/setup-linux-node.sh' >&2
  exit 1
fi
if [ ! -x "$sandbox_bin/near-sandbox" ]; then
  echo 'Install local NEAR Sandbox first: bash work/setup-near-sandbox.sh' >&2
  exit 1
fi
if [ ! -d sandbox/node_modules/near-workspaces ]; then
  echo 'Install Sandbox dependencies first: cd sandbox && npm ci --ignore-scripts' >&2
  exit 1
fi

export PATH="$node_bin:$PATH"
export NEAR_SANDBOX_BIN_PATH=1
export NEAR_SANDBOX_BINARY_PATH="$sandbox_bin"
cd sandbox
npm test
