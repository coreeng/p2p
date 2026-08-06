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

consumer_makefile="${tmp_dir}/ConsumerMakefile"
cat > "${consumer_makefile}" <<EOF
include ${repo_root}/p2p.mk

P2P_DEPLOYMENT_REGISTRY = internal.registry.example
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

run_make() {
  local -a unset_args=(
    -u P2P_REGISTRY
    -u P2P_REGISTRY_FAST_FEEDBACK_PATH
    -u P2P_REGISTRY_EXTENDED_TEST_PATH
    -u P2P_REGISTRY_PROD_PATH
    -u P2P_REGISTRY_FAST_FEEDBACK
    -u P2P_REGISTRY_EXTENDED_TEST
    -u P2P_REGISTRY_PROD
    -u P2P_DEPLOYMENT_REGISTRY
    -u P2P_DEPLOYMENT_REGISTRY_FAST_FEEDBACK
    -u P2P_DEPLOYMENT_REGISTRY_EXTENDED_TEST
    -u P2P_DEPLOYMENT_REGISTRY_PROD
    -u P2P_APP_NAME
    -u P2P_TENANT_NAME
    -u P2P_VERSION
    -u p2p_registry
    -u p2p_image
    -u p2p_image_tag
    -u p2p_image_cache
    -u p2p_namespace
    -u p2p_app_name
    -u p2p_tenant_name
    -u p2p_version
    -u p2p_app_url_suffix
  )

  env "${unset_args[@]}" make "$@"
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
  P2P_REGISTRY=public.registry.example
  P2P_APP_NAME=auth-test-2
  P2P_TENANT_NAME=auth-test-2
  P2P_VERSION=v-test
)

split_output="$(run_make -f "${makefile}" "${common_args[@]}" P2P_DEPLOYMENT_REGISTRY=internal.registry.example "${targets[@]}")"
split_expected='app|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2|public.registry.example/fast-feedback/auth-test-2:v-test
functional|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-functional|public.registry.example/fast-feedback/auth-test-2-functional:v-test
nft|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-nft|public.registry.example/fast-feedback/auth-test-2-nft:v-test
integration|internal.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-integration|public.registry.example/fast-feedback/auth-test-2-integration:v-test
extended-test|internal.registry.example/extended-test|public.registry.example/extended-test/auth-test-2-extended|public.registry.example/extended-test/auth-test-2-extended:v-test
prod|internal.registry.example/prod||'
assert_equals "${split_expected}" "${split_output}"

consumer_output="$(run_make -f "${consumer_makefile}" "${common_args[@]}" "${targets[@]}")"
assert_equals "${split_expected}" "${consumer_output}"

compatible_output="$(run_make -f "${makefile}" "${common_args[@]}" "${targets[@]}")"
compatible_expected='app|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2|public.registry.example/fast-feedback/auth-test-2:v-test
functional|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-functional|public.registry.example/fast-feedback/auth-test-2-functional:v-test
nft|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-nft|public.registry.example/fast-feedback/auth-test-2-nft:v-test
integration|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2-integration|public.registry.example/fast-feedback/auth-test-2-integration:v-test
extended-test|public.registry.example/extended-test|public.registry.example/extended-test/auth-test-2-extended|public.registry.example/extended-test/auth-test-2-extended:v-test
prod|public.registry.example/prod||'
assert_equals "${compatible_expected}" "${compatible_output}"

legacy_override_output="$(run_make -f "${makefile}" "${common_args[@]}" \
  P2P_REGISTRY_FAST_FEEDBACK=legacy.fast.example/custom \
  P2P_REGISTRY_EXTENDED_TEST=legacy.extended.example/custom \
  P2P_REGISTRY_PROD=legacy.prod.example/custom \
  "${targets[@]}")"
legacy_override_expected='app|legacy.fast.example/custom|legacy.fast.example/custom/auth-test-2|legacy.fast.example/custom/auth-test-2:v-test
functional|legacy.fast.example/custom|legacy.fast.example/custom/auth-test-2-functional|legacy.fast.example/custom/auth-test-2-functional:v-test
nft|legacy.fast.example/custom|legacy.fast.example/custom/auth-test-2-nft|legacy.fast.example/custom/auth-test-2-nft:v-test
integration|legacy.fast.example/custom|legacy.fast.example/custom/auth-test-2-integration|legacy.fast.example/custom/auth-test-2-integration:v-test
extended-test|legacy.extended.example/custom|legacy.extended.example/custom/auth-test-2-extended|legacy.extended.example/custom/auth-test-2-extended:v-test
prod|legacy.prod.example/custom||'
assert_equals "${legacy_override_expected}" "${legacy_override_output}"

deployment_override_output="$(run_make -f "${makefile}" "${common_args[@]}" \
  P2P_DEPLOYMENT_REGISTRY=internal.registry.example \
  P2P_DEPLOYMENT_REGISTRY_FAST_FEEDBACK=deployment.fast.example/custom \
  P2P_DEPLOYMENT_REGISTRY_EXTENDED_TEST=deployment.extended.example/custom \
  P2P_DEPLOYMENT_REGISTRY_PROD=deployment.prod.example/custom \
  "${targets[@]}")"
deployment_override_expected='app|public.registry.example/fast-feedback|public.registry.example/fast-feedback/auth-test-2|public.registry.example/fast-feedback/auth-test-2:v-test
functional|deployment.fast.example/custom|public.registry.example/fast-feedback/auth-test-2-functional|public.registry.example/fast-feedback/auth-test-2-functional:v-test
nft|deployment.fast.example/custom|public.registry.example/fast-feedback/auth-test-2-nft|public.registry.example/fast-feedback/auth-test-2-nft:v-test
integration|deployment.fast.example/custom|public.registry.example/fast-feedback/auth-test-2-integration|public.registry.example/fast-feedback/auth-test-2-integration:v-test
extended-test|deployment.extended.example/custom|public.registry.example/extended-test/auth-test-2-extended|public.registry.example/extended-test/auth-test-2-extended:v-test
prod|deployment.prod.example/custom||'
assert_equals "${deployment_override_expected}" "${deployment_override_output}"

if [[ "${P2P_REGISTRY_VARIABLES_ISOLATION_RUN-}" != "1" ]]; then
  env \
    P2P_REGISTRY_VARIABLES_ISOLATION_RUN=1 \
    p2p_registry=ambient-registry \
    p2p_image=ambient-image \
    p2p_image_tag=ambient-image-tag \
    p2p_image_cache=ambient-image-cache \
    p2p_namespace=ambient-namespace \
    p2p_app_name=ambient-app \
    p2p_tenant_name=ambient-tenant \
    p2p_version=ambient-version \
    p2p_app_url_suffix=ambient-url-suffix \
    "$0" >/dev/null
fi

printf 'PASS: p2p-registry-variables\n'
