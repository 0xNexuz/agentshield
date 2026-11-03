# Rebuilds contracts/vault the way the deployed WASM was built, then compares SHA-256 hashes.
#
# The deployed WASM names its compiler in its "producers" section: rustc 1.96.0 (ac68faa20 2026-05-25).
# Its panic strings also contain the folders of the original Windows build machine, so a byte-for-byte
# rebuild has to reproduce those paths. This script recreates them under C:\Users\USER\ and installs
# Rust 1.96.0 there. Run it on a throwaway Windows machine or a CI runner (CI runs it on every push).
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $true

$Repo = (Resolve-Path "$PSScriptRoot\..").Path
$Root = 'C:\Users\USER\Documents\Codex\2026-10-23\files-pasted-by-the-user-hackathon'
$env:RUSTUP_HOME = 'C:\Users\USER\.rustup'
$env:CARGO_HOME = "$Root\.cargo-home"
$Toolchain = "$env:RUSTUP_HOME\toolchains\stable-x86_64-pc-windows-msvc"
# The original build fetched crates through work/cargo-registry-proxy.mjs on 127.0.0.1:4727,
# so Cargo unpacked them into this folder. Remapping gives the same embedded paths from crates.io.
$OriginalRegistry = "$env:CARGO_HOME\registry\src\127.0.0.1-52429baa3a074769"

New-Item -ItemType Directory -Force $Root, $env:RUSTUP_HOME, $env:CARGO_HOME | Out-Null
Remove-Item -Recurse -Force "$Root\contracts" -ErrorAction SilentlyContinue
Copy-Item -Recurse -Force "$Repo\contracts" $Root
Remove-Item -Recurse -Force "$Root\contracts\vault\target" -ErrorAction SilentlyContinue

if (-not (Test-Path "$Toolchain\bin\rustc.exe")) {
  Invoke-WebRequest https://win.rustup.rs/x86_64 -OutFile "$env:TEMP\rustup-init.exe"
  & "$env:TEMP\rustup-init.exe" -y --no-modify-path --profile minimal --default-toolchain none
  & "$env:CARGO_HOME\bin\rustup.exe" toolchain install 1.96.0-x86_64-pc-windows-msvc --profile minimal --component rust-src --target wasm32-unknown-unknown
  # The original toolchain folder was named "stable"; rustc embeds that folder in standard-library paths.
  Rename-Item "$env:RUSTUP_HOME\toolchains\1.96.0-x86_64-pc-windows-msvc" 'stable-x86_64-pc-windows-msvc'
}
$env:PATH = "$Toolchain\bin;$env:PATH"
$env:RUSTC = "$Toolchain\bin\rustc.exe"
& $env:RUSTC -vV

Set-Location $Root
cargo fetch --manifest-path contracts/vault/Cargo.toml --locked
$registry = Get-ChildItem "$env:CARGO_HOME\registry\src" -Directory | Where-Object Name -like 'index.crates.io-*' | Select-Object -First 1
$env:RUSTFLAGS = "--remap-path-prefix=$($registry.FullName)=$OriginalRegistry"
cargo build --manifest-path contracts/vault/Cargo.toml --target wasm32-unknown-unknown --release --offline --locked

$deployed = "$Repo\deployment\agentshield_vault.wasm"
$built = "$Root\contracts\vault\target\wasm32-unknown-unknown\release\agentshield_vault.wasm"
$want = (Get-FileHash $deployed -Algorithm SHA256).Hash.ToLower()
$got = (Get-FileHash $built -Algorithm SHA256).Hash.ToLower()
"deployed WASM: $want ($((Get-Item $deployed).Length) bytes)"
"rebuilt WASM:  $got ($((Get-Item $built).Length) bytes)"
if ($got -ne $want) { throw 'MISMATCH: the rebuilt WASM differs from deployment/agentshield_vault.wasm' }
'MATCH: the deployed WASM rebuilds byte for byte from contracts/vault'
