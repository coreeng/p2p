#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="${script_dir}/../github-oidc-registry-login"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

mock_bin="${tmp_dir}/bin"
mkdir -p "${mock_bin}"

cat > "${mock_bin}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${MOCK_CURL_ARGS_FILE}"
cat > "${MOCK_CURL_STDIN_FILE}"
cat "${MOCK_CURL_RESPONSE_FILE}"
exit "${MOCK_CURL_EXIT:-0}"
EOF

cat > "${mock_bin}/docker" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${MOCK_DOCKER_ARGS_FILE}"
cat > "${MOCK_DOCKER_STDIN_FILE}"
env | LC_ALL=C sort > "${MOCK_DOCKER_ENV_FILE}"
printf 'docker\n' >> "${MOCK_LOGIN_ORDER_FILE}"
exit "${MOCK_DOCKER_EXIT:-0}"
EOF

cat > "${mock_bin}/skopeo" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${MOCK_SKOPEO_ARGS_FILE}"
cat > "${MOCK_SKOPEO_STDIN_FILE}"
env | LC_ALL=C sort > "${MOCK_SKOPEO_ENV_FILE}"
printf 'skopeo\n' >> "${MOCK_LOGIN_ORDER_FILE}"
exit "${MOCK_SKOPEO_EXIT:-0}"
EOF

chmod +x "${mock_bin}/curl" "${mock_bin}/docker" "${mock_bin}/skopeo"

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

assert_file_equals() {
  local expected="$1"
  local file="$2"
  local actual
  actual="$(cat "${file}")"
  [[ "${actual}" == "${expected}" ]] || fail "expected ${file} to contain '${expected}', got '${actual}'"
}

assert_file_contains_line() {
  local expected="$1"
  local file="$2"
  while IFS= read -r line; do
    [[ "${line}" == "${expected}" ]] && return 0
  done < "${file}"
  fail "expected ${file} to contain line '${expected}'"
}

assert_file_excludes() {
  local unexpected="$1"
  local file="$2"
  if [[ -f "${file}" ]] && grep -Fq -- "${unexpected}" "${file}"; then
    fail "expected ${file} not to contain '${unexpected}'"
  fi
}

run_helper() {
  local case_name="$1"
  shift

  export MOCK_CURL_ARGS_FILE="${tmp_dir}/${case_name}.curl-args"
  export MOCK_CURL_STDIN_FILE="${tmp_dir}/${case_name}.curl-stdin"
  export MOCK_DOCKER_ARGS_FILE="${tmp_dir}/${case_name}.docker-args"
  export MOCK_DOCKER_STDIN_FILE="${tmp_dir}/${case_name}.docker-stdin"
  export MOCK_DOCKER_ENV_FILE="${tmp_dir}/${case_name}.docker-env"
  export MOCK_SKOPEO_ARGS_FILE="${tmp_dir}/${case_name}.skopeo-args"
  export MOCK_SKOPEO_STDIN_FILE="${tmp_dir}/${case_name}.skopeo-stdin"
  export MOCK_SKOPEO_ENV_FILE="${tmp_dir}/${case_name}.skopeo-env"
  export MOCK_LOGIN_ORDER_FILE="${tmp_dir}/${case_name}.login-order"
  RUN_OUTPUT_FILE="${tmp_dir}/${case_name}.output"

  set +e
  PATH="${mock_bin}:${PATH}" "${helper}" "$@" > "${RUN_OUTPUT_FILE}" 2>&1
  RUN_STATUS=$?
  set -e
}

expect_failure() {
  local case_name="$1"
  shift
  run_helper "${case_name}" "$@"
  [[ ${RUN_STATUS} -ne 0 ]] || fail "${case_name} unexpectedly succeeded"
  [[ ! -e "${MOCK_DOCKER_ARGS_FILE}" ]] || fail "${case_name} invoked docker"
  [[ ! -e "${MOCK_SKOPEO_ARGS_FILE}" ]] || fail "${case_name} invoked skopeo"
}

assert_login_token_confined() {
  local token="$1"
  assert_file_equals "::add-mask::${token}" "${RUN_OUTPUT_FILE}"
  assert_file_excludes "${token}" "${MOCK_CURL_ARGS_FILE}"
  assert_file_excludes "${token}" "${MOCK_DOCKER_ARGS_FILE}"
  assert_file_excludes "${token}" "${MOCK_SKOPEO_ARGS_FILE}"
  assert_file_excludes "${token}" "${MOCK_DOCKER_ENV_FILE}"
  assert_file_excludes "${token}" "${MOCK_SKOPEO_ENV_FILE}"
  assert_file_equals 'existing-env=value' "${GITHUB_ENV}"
  assert_file_equals 'existing-output=value' "${GITHUB_OUTPUT}"
}

export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc'
export ACTIONS_ID_TOKEN_REQUEST_TOKEN='request-token'
export MOCK_CURL_RESPONSE_FILE="${tmp_dir}/curl-response"
export GITHUB_ENV="${tmp_dir}/github-env"
export GITHUB_OUTPUT="${tmp_dir}/github-output"
printf '%s' 'existing-env=value' > "${GITHUB_ENV}"
printf '%s' 'existing-output=value' > "${GITHUB_OUTPUT}"
printf '%s' '{"value":"raw-zot-oidc-token"}' > "${MOCK_CURL_RESPONSE_FILE}"
unset MOCK_CURL_EXIT MOCK_DOCKER_EXIT MOCK_SKOPEO_EXIT

run_helper separate-args \
  --audience 'api://registry name?x=y&z=/+' \
  --registry registry.example.test:8443 \
  --skopeo-auth-file "${tmp_dir}/containers/auth.json"
[[ ${RUN_STATUS} -eq 0 ]] || fail "separate argument invocation failed: $(cat "${RUN_OUTPUT_FILE}")"
assert_file_equals $'--disable\n--fail\n--silent\n--show-error\n--config\n-' "${MOCK_CURL_ARGS_FILE}"
assert_file_excludes 'request-token' "${MOCK_CURL_ARGS_FILE}"
assert_file_excludes 'location' "${MOCK_CURL_ARGS_FILE}"
assert_file_contains_line 'header = "Authorization: Bearer request-token"' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'url = "https://tokens.example.test/oidc?audience=api%3A%2F%2Fregistry%20name%3Fx%3Dy%26z%3D%2F%2B"' "${MOCK_CURL_STDIN_FILE}"
assert_file_equals $'login\nregistry.example.test:8443\n--username\noauth\n--password-stdin' "${MOCK_DOCKER_ARGS_FILE}"
assert_file_equals 'raw-zot-oidc-token' "${MOCK_DOCKER_STDIN_FILE}"
assert_file_equals $'login\n--authfile\n'"${tmp_dir}"$'/containers/auth.json\n--username\noauth\n--password-stdin\nregistry.example.test:8443' "${MOCK_SKOPEO_ARGS_FILE}"
assert_file_equals 'raw-zot-oidc-token' "${MOCK_SKOPEO_STDIN_FILE}"
assert_login_token_confined 'raw-zot-oidc-token'
assert_file_excludes 'request-token' "${MOCK_DOCKER_ENV_FILE}"
assert_file_excludes 'request-token' "${MOCK_SKOPEO_ENV_FILE}"
assert_file_equals $'docker\nskopeo' "${MOCK_LOGIN_ORDER_FILE}"

export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc?api-version=1'
run_helper equals-args \
  '--audience=workload identity' \
  '--registry=registry.example.test' \
  "--skopeo-auth-file=${tmp_dir}/auth.json"
[[ ${RUN_STATUS} -eq 0 ]] || fail "equals argument invocation failed: $(cat "${RUN_OUTPUT_FILE}")"
assert_file_contains_line 'url = "https://tokens.example.test/oidc?api-version=1&audience=workload%20identity"' "${MOCK_CURL_STDIN_FILE}"

export MOCK_DOCKER_EXIT=1
run_helper docker-login-failure --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json
[[ ${RUN_STATUS} -ne 0 ]] || fail "Docker login failure unexpectedly succeeded"
assert_file_equals 'docker' "${MOCK_LOGIN_ORDER_FILE}"
[[ ! -e "${MOCK_SKOPEO_ARGS_FILE}" ]] || fail "Docker login failure invoked skopeo"
assert_login_token_confined 'raw-zot-oidc-token'
unset MOCK_DOCKER_EXIT

export MOCK_SKOPEO_EXIT=1
run_helper skopeo-login-failure --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json
[[ ${RUN_STATUS} -ne 0 ]] || fail "Skopeo login failure unexpectedly succeeded"
assert_file_equals $'docker\nskopeo' "${MOCK_LOGIN_ORDER_FILE}"
assert_login_token_confined 'raw-zot-oidc-token'
unset MOCK_SKOPEO_EXIT

expect_failure missing-audience --registry registry.test --skopeo-auth-file /tmp/auth.json
expect_failure empty-audience --audience= --registry registry.test --skopeo-auth-file /tmp/auth.json
expect_failure missing-registry --audience workload --skopeo-auth-file /tmp/auth.json
expect_failure empty-registry --audience workload --registry= --skopeo-auth-file /tmp/auth.json
expect_failure missing-auth-file --audience workload --registry registry.test
expect_failure empty-auth-file --audience workload --registry registry.test --skopeo-auth-file=

unset ACTIONS_ID_TOKEN_REQUEST_URL
expect_failure missing-request-url --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json
export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc'

unset ACTIONS_ID_TOKEN_REQUEST_TOKEN
expect_failure missing-request-token --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json
export ACTIONS_ID_TOKEN_REQUEST_TOKEN='request-token'

export MOCK_CURL_EXIT=22
expect_failure curl-failure --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json
unset MOCK_CURL_EXIT

printf '%s' '{}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure missing-value --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json

printf '%s' '{"value":""}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure empty-value --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json

printf '%s' '{"value":42}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure non-string-value --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json

printf '%s' 'not-json' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure malformed-response --audience workload --registry registry.test --skopeo-auth-file /tmp/auth.json

printf 'PASS: github-oidc-registry-login\n'
