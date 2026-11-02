#!/usr/bin/env bash
set -euo pipefail

version=v24.22.2
archive="node-${version}-linux-x64.tar.xz"
base="https://nodejs.org/dist/${version}"
project_root="$(cd "$(dirname "$0")/.." && pwd)"
tools_dir="${project_root}/.tools"
install_dir="${tools_dir}/node-${version}-linux-x64"

if [[ -x "${install_dir}/bin/node" ]]; then
  "${install_dir}/bin/node" --version
  exit 0
fi

mkdir -p "${tools_dir}"
tmp_dir="$(mktemp -d "${tools_dir}/node-download.XXXXXX")"
trap 'rm -f -- "${tmp_dir}/${archive}" "${tmp_dir}/SHASUMS256.txt"; rmdir -- "${tmp_dir}"' EXIT
curl --fail --location --silent --show-error --retry 3 "${base}/${archive}" -o "${tmp_dir}/${archive}"
curl --fail --location --silent --show-error --retry 3 "${base}/SHASUMS256.txt" -o "${tmp_dir}/SHASUMS256.txt"
expected="$(awk -v archive="${archive}" '$2 == archive { print $1 }' "${tmp_dir}/SHASUMS256.txt")"
if [[ ! "${expected}" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'Official Node.js checksum not found.' >&2
  exit 1
fi
printf '%s  %s\n' "${expected}" "${tmp_dir}/${archive}" | sha256sum --check --status
tar -xJf "${tmp_dir}/${archive}" -C "${tools_dir}"
"${install_dir}/bin/node" --version
