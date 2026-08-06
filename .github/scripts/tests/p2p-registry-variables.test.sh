#!/usr/bin/env bash

set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

makefile="${tmp_dir}/Makefile"
cat > "${makefile}" <<EOF
include ${repo_root}/p2p.mk

p2p_image ?=
p2p_image_tag ?=

print-%:
	@printf '%s|%s|%s|%s\n' '\$*' '\$(p2p_registry)' '\$(p2p_image)' '\$(p2p_image_tag)'
EOF

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_equals() {
  local expected="$1"
  local actual="$2"
  [[ "${actual}" == "${expected}" ]] || fail "expected:\n${expected}\ngot:\n${actual}"
}

targets=(
  print-app
  print-functional
  print-nft
  print-integration
  print-extended-test
  print-prod
)

common_args=(
  --no-print-directory
  -f "${makefile}"
  P2P_REGISTRY=public.registry.example
  P2P_APP_NAME=auth-test-2
  P2P_TENANT_NAME=auth-test-2
  P2P_VERSION=v-test
)

split_output="$(make "${common_args[@]}" P2P_DEPLOYMENT_REGISTRY=internal.registry.example "${targets[@]}")"
split_expected='app|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2|public.registry.example/fast-feedback/auth-test-2:v-test
functional|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-functional|public.registry.example/fast-feedback/auth-test-2-functional:v-test
nft|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-nft|public.registry.example/fast-feedback/auth-test-2-nft:v-test
integration|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-integration|public.registry.example/fast-feedback/auth-test-2-integration:v-test
extended-test|internal.registry.example/extended-test|public.registry.example/extended-test/auth-test-2-extended|public.registry.example/extended-test/auth-test-2-extended:v-test
prod|internal.registry.example/prod||'
assert_equals "${split_expected}" "${split_output}"

compatible_output="$(env -u P2P_DEPLOYMENT_REGISTRY make "${common_args[@]}" "${targets[@]}")"
compatible_expected='app|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2|public.registry.example/fast-feedback/auth-test-2:v-test
functional|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-functional|public.registry.example/fast-feedback/auth-test-2-functional:v-test
nft|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-nft|public.registry.example/fast-feedback/auth-test-2-nft:v-test
integration|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-integration|public.registry.example/fast-feedback/auth-test-2-integration:v-test
extended-test|public.registry.example/extended-test|public.registry.example/extended-test/auth-test-2-extended|public.registry.example/extended-test/auth-test-2-extended:v-test
prod|public.registry.example/prod||'
assert_equals "${compatible_expected}" "${compatible_output}"

printf 'PASS: p2p-registry-variables\n'
