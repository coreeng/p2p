#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
test_dir="$(mktemp -d)"
trap 'rm -rf "${test_dir}"' EXIT

mkdir -p "${test_dir}/bin"

cat >"${test_dir}/bin/skopeo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' "$*" >>"${SKOPEO_LOG}"
if [[ "$*" == *"/${SKOPEO_FAILURE_IMAGE}:"* ]]; then
  exit 42
fi
EOF
chmod +x "${test_dir}/bin/skopeo"

test_promotion_target() {
  local target="$1"
  local source_path="$2"
  local destination_path="$3"
  local log_file="${test_dir}/${target}.log"

  if PATH="${test_dir}/bin:${PATH}" \
    SKOPEO_LOG="${log_file}" \
    SKOPEO_FAILURE_IMAGE="second" \
    make --no-print-directory -f "${repo_root}/p2p.mk" \
      P2P_IMAGE_NAMES="first second third" \
      P2P_VERSION="1.2.3" \
      SOURCE_REGISTRY="source.example" \
      REGISTRY="destination.example" \
      "${target}"; then
    printf '%s\n' "${target} unexpectedly succeeded" >&2
    exit 1
  fi

  calls=()
  while IFS= read -r call; do
    calls+=("${call}")
  done <"${log_file}"
  if [[ "${#calls[@]}" -ne 2 ]]; then
    printf '%s\n' "${target} made ${#calls[@]} copy attempts; expected 2" >&2
    exit 1
  fi
  local expected_first="copy --all --preserve-digests docker://source.example/${source_path}/first:1.2.3 docker://destination.example/${destination_path}/first:1.2.3"
  local expected_second="copy --all --preserve-digests docker://source.example/${source_path}/second:1.2.3 docker://destination.example/${destination_path}/second:1.2.3"
  if [[ "${calls[0]}" != "${expected_first}" || "${calls[1]}" != "${expected_second}" ]]; then
    printf '%s\n' "${target} attempted images in an unexpected order" >&2
    exit 1
  fi
  if [[ "${calls[*]}" == *"/third:1.2.3"* ]]; then
    printf '%s\n' "${target} continued after the failed image" >&2
    exit 1
  fi
}

test_promotion_target p2p-promote-to-extended-test fast-feedback extended-test
test_promotion_target p2p-promote-to-prod extended-test prod
