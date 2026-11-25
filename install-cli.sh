#!/usr/bin/env bash
# LarpCode CLI installer for macOS.
#
# Install or update only the command-line interface (no desktop app):
#   curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | bash
#
# Install a specific release:
#   curl -fsSL https://github.com/Aero-Apex/LarpCode-MacOS/releases/latest/download/install-cli.sh | bash -s -- --version 1.0.0
#
# Install into a custom directory, or remove the CLI:
#   ./install-cli.sh --dir /usr/local/bin
#   ./install-cli.sh --uninstall
set -euo pipefail

info() { printf '%s\n' "$*"; }
warn() { printf 'Warning: %s\n' "$*" >&2; }
fail() { printf 'Error: %s\n' "$*" >&2; exit 1; }

[[ -n "${HOME:-}" ]] || fail "HOME is not set; cannot determine the default install directory."

readonly REPOSITORY="Aero-Apex/LarpCode-MacOS"
readonly RELEASES_URL="https://github.com/${REPOSITORY}/releases"
readonly BINARY_NAME="larpcode"
readonly DEFAULT_DIR="${HOME}/.larpcode/bin"

usage() {
    cat <<EOF
LarpCode CLI installer for macOS

Usage: install-cli.sh [options]

Options:
  -h, --help             Show this help message
  -v, --version <ver>    Install a specific release (default: latest)
  -d, --dir <path>       Install directory (default: \$HOME/.larpcode/bin)
      --no-check         Skip the post-install '--help' verification
  -u, --uninstall        Remove the installed CLI
EOF
}

version_arg=""
version_explicit=false
install_dir="$DEFAULT_DIR"
uninstall=false
no_check=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        -h|--help)
            usage
            exit 0
            ;;
        -v|--version)
            [[ $# -ge 2 && -n "$2" ]] || fail "--version requires a version argument"
            version_arg="$2"
            version_explicit=true
            shift 2
            ;;
        --version=*)
            [[ -n "${1#*=}" ]] || fail "--version requires a version argument"
            version_arg="${1#*=}"
            version_explicit=true
            shift
            ;;
        -d|--dir)
            [[ $# -ge 2 && -n "$2" ]] || fail "--dir requires a directory argument"
            install_dir="$2"
            shift 2
            ;;
        --dir=*)
            [[ -n "${1#*=}" ]] || fail "--dir requires a directory argument"
            install_dir="${1#*=}"
            shift
            ;;
        -u|--uninstall)
            uninstall=true
            shift
            ;;
        --no-check)
            no_check=true
            shift
            ;;
        *)
            fail "Unknown option '$1' (try --help)"
            ;;
    esac
done

# Accept a quoted "~/..." and make relative paths absolute before installing.
install_dir="${install_dir/#\~/$HOME}"
case "$install_dir" in
    /*) ;;
    *) install_dir="$PWD/$install_dir" ;;
esac

if [[ "$install_dir" == "$DEFAULT_DIR" ]]; then
    path_line='export PATH="$HOME/.larpcode/bin:$PATH"'
else
    path_line="export PATH=\"${install_dir}:\$PATH\""
fi

if [[ "$uninstall" == true ]]; then
    target="${install_dir}/${BINARY_NAME}"
    if [[ -e "$target" || -L "$target" ]]; then
        rm -f -- "$target"
        info "Removed ${target}"
    else
        info "No LarpCode CLI found at ${target}"
    fi
    rmdir "$install_dir" 2>/dev/null || true
    info ""
    info "If you added the CLI to your PATH, remove this line from ~/.zshrc or ~/.bashrc:"
    printf '  %s\n' "$path_line"
    exit 0
fi

command -v curl >/dev/null 2>&1 || fail "'curl' is required but was not found on PATH."

ARCH=""
detect_arch() {
    local machine translated
    machine=$(uname -m) || fail "Could not detect the CPU architecture."
    case "$machine" in
        arm64|aarch64) ARCH="arm64" ;;
        x86_64|amd64) ARCH="x64" ;;
        *) fail "Unsupported architecture '${machine}'. This installer supports arm64 and x64 macOS." ;;
    esac
    if [[ "$ARCH" == "x64" ]]; then
        translated=$(sysctl -n sysctl.proc_translated 2>/dev/null || printf '0')
        if [[ "$translated" == "1" ]]; then
            ARCH="arm64"
            info "Detected Rosetta 2; installing the native arm64 CLI."
        fi
    fi
}

# Resolve the newest release tag by following the /releases/latest redirect,
# falling back to the GitHub API if the redirect does not expose a tag.
resolve_latest_version() {
    local effective="" tag="" payload
    if effective=$(curl -fsSL -o /dev/null -w '%{url_effective}' "${RELEASES_URL}/latest"); then
        tag="${effective##*/}"
    else
        warn "Could not follow the GitHub latest-release redirect; trying the GitHub API."
    fi
    if [[ -z "$tag" || "$tag" == "latest" ]]; then
        if ! payload=$(curl -fsSL "https://api.github.com/repos/${REPOSITORY}/releases/latest"); then
            fail "Could not determine the latest LarpCode release. Use --version to specify one."
        fi
        tag=$(printf '%s\n' "$payload" | sed -n 's/.*"tag_name"[[:space:]]*:[[:space:]]*"\([^"]*\)".*/\1/p' | head -n 1 || true)
        [[ -n "$tag" ]] || fail "Could not read the latest release tag from GitHub. Use --version."
    fi
    printf '%s\n' "${tag#v}"
}

download_file() {
    local url="$1" dest="$2" label="$3" rc=0
    info "Downloading ${label}:"
    info "  ${url}"
    curl -fL -sS --retry 3 --retry-delay 1 --connect-timeout 15 -o "$dest" "$url" || rc=$?
    if [[ "$rc" -eq 0 ]]; then
        return 0
    fi
    rm -f -- "$dest"
    warn "Failed to download ${label} (curl exit ${rc})."
    return 1
}

# Minimal JSON readers: macOS does not ship jq, and cli.json is a flat object
# whose assets are simple {url, sha256} records.
json_top_field() {
    local file="$1" field="$2"
    tr -d '\n' < "$file" \
        | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
        | head -n 1 \
        | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/' \
        || true
}

json_object_field() {
    local file="$1" key="$2" field="$3"
    tr -d '\n' < "$file" \
        | grep -oE "\"${key}\"[[:space:]]*:[[:space:]]*\{[^}]*\}" \
        | grep -oE "\"${field}\"[[:space:]]*:[[:space:]]*\"[^\"]*\"" \
        | head -n 1 \
        | sed -E 's/.*:[[:space:]]*"([^"]*)".*/\1/' \
        || true
}

manifest_field() {
    local file="$1" field="$2" key value
    local keys
    if [[ "$ARCH" == "arm64" ]]; then
        keys=(darwin-arm64 macos-arm64 arm64 darwin-aarch64 larpcode-arm64)
    else
        keys=(darwin-x64 macos-x64 x64 darwin-amd64 larpcode-x64)
    fi
    for key in "${keys[@]}"; do
        value=$(json_object_field "$file" "$key" "$field")
        if [[ -n "$value" ]]; then
            printf '%s\n' "$value"
            return 0
        fi
    done
    return 1
}

sha256_file() {
    local file="$1" output
    command -v shasum >/dev/null 2>&1 || return 1
    if output=$(shasum -a 256 "$file" 2>/dev/null); then
        printf '%s\n' "$output" | awk '{print $1}'
        return 0
    fi
    if output=$(shasum "$file" 2>/dev/null); then
        printf '%s\n' "$output" | awk '{print $1}'
        return 0
    fi
    return 1
}

detect_arch

if [[ "$version_explicit" == true ]]; then
    VERSION="${version_arg#v}"
    if [[ "$VERSION" == "1" ]]; then
        VERSION="1.0.0"
    fi
else
    VERSION=$(resolve_latest_version)
fi

# v1 is an explicit alias of v1.0.0 in PORT_SPEC.md.
release_roots=()
if [[ "$version_explicit" == true ]]; then
    release_roots+=("${RELEASES_URL}/download/v${VERSION}")
    if [[ "$VERSION" == "1.0.0" ]]; then
        release_roots+=("${RELEASES_URL}/download/v1")
    fi
else
    release_roots+=("${RELEASES_URL}/latest/download")
fi

tmp_dir=$(mktemp -d "${TMPDIR:-/tmp}/larpcode-cli.XXXXXX") || fail "Could not create a temporary directory."
staged=""
cleanup() {
    if [[ -n "$staged" ]]; then
        rm -f -- "$staged"
    fi
    rm -rf -- "$tmp_dir"
}
trap cleanup EXIT

manifest_file="${tmp_dir}/cli.json"
manifest_version=""
selected_root=""
manifest_ok=false
for root in "${release_roots[@]}"; do
    if ! download_file "${root}/cli.json" "$manifest_file" "cli.json"; then
        continue
    fi
    manifest_version=$(json_top_field "$manifest_file" version)
    if [[ -n "$manifest_version" && "$version_explicit" == true && "$manifest_version" != "$VERSION" ]]; then
        warn "cli.json at ${root} reports version ${manifest_version}, expected ${VERSION}; trying another source."
        continue
    fi
    if [[ -n "$manifest_version" && "$version_explicit" != true ]]; then
        VERSION="$manifest_version"
    fi
    selected_root="$root"
    manifest_ok=true
    break
done
[[ "$manifest_ok" == true ]] || fail "Could not download cli.json for LarpCode ${VERSION} from ${RELEASES_URL}."

binary_file="${tmp_dir}/${BINARY_NAME}"
asset_url=$(manifest_field "$manifest_file" url || true)
candidates=("${selected_root}/${BINARY_NAME}" "${selected_root}/${BINARY_NAME}-${ARCH}")
if [[ "$asset_url" == http* ]]; then
    duplicate=false
    for url in "${candidates[@]}"; do
        if [[ "$url" == "$asset_url" ]]; then
            duplicate=true
            break
        fi
    done
    if [[ "$duplicate" != true ]]; then
        candidates+=("$asset_url")
    fi
fi

binary_ok=false
for url in "${candidates[@]}"; do
    if download_file "$url" "${binary_file}.part" "${BINARY_NAME}-${ARCH}"; then
        mv -f -- "${binary_file}.part" "$binary_file"
        binary_ok=true
        break
    fi
done
[[ "$binary_ok" == true ]] || fail "Could not download the ${ARCH} CLI binary for LarpCode ${VERSION}."

expected=$(manifest_field "$manifest_file" sha256 || true)
if [[ -z "$expected" ]]; then
    # Some feeds publish a single top-level checksum instead of per-asset entries.
    count=$(tr -d '\n' < "$manifest_file" | grep -oE '"sha256"[[:space:]]*:[[:space:]]*"[^"]*"' | wc -l | tr -d '[:space:]' || true)
    if [[ "$count" == "1" ]]; then
        expected=$(json_top_field "$manifest_file" sha256)
    fi
fi
[[ -n "$expected" ]] || fail "cli.json has no SHA-256 checksum for darwin-${ARCH}; refusing to install an unverified binary."

actual=$(sha256_file "$binary_file") || fail "'shasum' is required to verify the download but is not available."
expected=$(printf '%s' "$expected" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
actual=$(printf '%s' "$actual" | tr '[:upper:]' '[:lower:]' | tr -d '[:space:]')
if [[ "$actual" != "$expected" ]]; then
    fail "Checksum mismatch: expected ${expected}, got ${actual}. Download the release again."
fi
info "SHA-256 verified: ${actual}"

mkdir -p -- "$install_dir"
staged="${install_dir}/.${BINARY_NAME}.$$"
cp -- "$binary_file" "$staged"
chmod +x "$staged"
if command -v xattr >/dev/null 2>&1; then
    if xattr "$staged" 2>/dev/null | grep -q 'com.apple.quarantine'; then
        if ! xattr -d com.apple.quarantine "$staged"; then
            warn "Could not remove the quarantine attribute from ${staged}."
        fi
    fi
fi
mv -f -- "$staged" "${install_dir}/${BINARY_NAME}"
staged=""

info ""
info "LarpCode ${VERSION} CLI installed to ${install_dir}/${BINARY_NAME}"
info ""
info "Add the CLI to your PATH in ~/.zshrc (zsh) or ~/.bashrc (bash):"
printf '  %s\n' "$path_line"
info "Open a new terminal, then run: larpcode --help"

if [[ "$no_check" != true ]]; then
    info ""
    info "Verifying the installed CLI..."
    if ! check_output=$("${install_dir}/${BINARY_NAME}" --help 2>&1); then
        printf '%s\n' "$check_output" | head -n 10 >&2
        fail "The installed CLI did not pass the '--help' check. Use --no-check to skip it."
    fi
    info "Verification passed."
fi
