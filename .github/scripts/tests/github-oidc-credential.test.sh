#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
helper="${script_dir}/../github-oidc-credential"
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

cat > "${mock_bin}/pinniped" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
printf '%s\n' "$@" > "${MOCK_PINNIPED_ARGS_FILE}"
printf '%s' "${PINNIPED_GITHUB_OIDC_TOKEN-}" > "${MOCK_PINNIPED_TOKEN_FILE}"
env | LC_ALL=C sort > "${MOCK_PINNIPED_ENV_FILE}"
EOF

chmod +x "${mock_bin}/curl" "${mock_bin}/pinniped"

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

assert_token_only_in_credential_env() {
  local token="$1"
  local file="$2"
  local line
  while IFS= read -r line; do
    if [[ "${line}" == *"${token}"* && "${line}" != "PINNIPED_GITHUB_OIDC_TOKEN=${token}" ]]; then
      fail "raw token appeared in unexpected environment variable: ${line%%=*}"
    fi
  done < "${file}"
}

run_helper() {
  local case_name="$1"
  shift

  export MOCK_CURL_ARGS_FILE="${tmp_dir}/${case_name}.curl-args"
  export MOCK_CURL_STDIN_FILE="${tmp_dir}/${case_name}.curl-stdin"
  export MOCK_PINNIPED_ARGS_FILE="${tmp_dir}/${case_name}.pinniped-args"
  export MOCK_PINNIPED_TOKEN_FILE="${tmp_dir}/${case_name}.pinniped-token"
  export MOCK_PINNIPED_ENV_FILE="${tmp_dir}/${case_name}.pinniped-env"
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
  [[ ! -e "${MOCK_PINNIPED_ARGS_FILE}" ]] || fail "${case_name} invoked pinniped"
}

export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc'
export ACTIONS_ID_TOKEN_REQUEST_TOKEN='request-token'
export MOCK_CURL_RESPONSE_FILE="${tmp_dir}/curl-response"
printf '%s' '{"value":"raw-oidc-token"}' > "${MOCK_CURL_RESPONSE_FILE}"
unset MOCK_CURL_EXIT

run_helper separate-audience --concierge-endpoint https://concierge.test --audience 'api://cluster name?x=y&z=/+' --skip-browser
[[ ${RUN_STATUS} -eq 0 ]] || fail "separate --audience invocation failed: $(cat "${RUN_OUTPUT_FILE}")"
assert_file_equals $'--config\n-' "${MOCK_CURL_ARGS_FILE}"
assert_file_excludes 'request-token' "${MOCK_CURL_ARGS_FILE}"
assert_file_contains_line 'fail' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'silent' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'show-error' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'location' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'header = "Authorization: Bearer request-token"' "${MOCK_CURL_STDIN_FILE}"
assert_file_contains_line 'url = "https://tokens.example.test/oidc?audience=api%3A%2F%2Fcluster%20name%3Fx%3Dy%26z%3D%2F%2B"' "${MOCK_CURL_STDIN_FILE}"
assert_file_equals $'login\nstatic\n--token-env=PINNIPED_GITHUB_OIDC_TOKEN\n--concierge-endpoint\nhttps://concierge.test\n--skip-browser' "${MOCK_PINNIPED_ARGS_FILE}"
assert_file_equals 'raw-oidc-token' "${MOCK_PINNIPED_TOKEN_FILE}"
assert_file_contains_line 'PINNIPED_GITHUB_OIDC_TOKEN=raw-oidc-token' "${MOCK_PINNIPED_ENV_FILE}"
assert_file_excludes 'ACTIONS_ID_TOKEN_REQUEST_TOKEN=' "${MOCK_PINNIPED_ENV_FILE}"
assert_file_excludes 'ACTIONS_ID_TOKEN_REQUEST_URL=' "${MOCK_PINNIPED_ENV_FILE}"
assert_file_excludes 'request-token' "${MOCK_PINNIPED_ENV_FILE}"
assert_token_only_in_credential_env 'raw-oidc-token' "${MOCK_PINNIPED_ENV_FILE}"
assert_file_excludes 'raw-oidc-token' "${MOCK_PINNIPED_ARGS_FILE}"
assert_file_excludes 'raw-oidc-token' "${RUN_OUTPUT_FILE}"

export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc?api-version=1'
run_helper equals-audience '--audience=workload identity' --credential-cache /tmp/cache
[[ ${RUN_STATUS} -eq 0 ]] || fail "--audience=value invocation failed: $(cat "${RUN_OUTPUT_FILE}")"
assert_file_contains_line 'url = "https://tokens.example.test/oidc?api-version=1&audience=workload%20identity"' "${MOCK_CURL_STDIN_FILE}"
assert_file_equals $'login\nstatic\n--token-env=PINNIPED_GITHUB_OIDC_TOKEN\n--credential-cache\n/tmp/cache' "${MOCK_PINNIPED_ARGS_FILE}"

expect_failure missing-audience --skip-browser
expect_failure missing-audience-value --audience

unset ACTIONS_ID_TOKEN_REQUEST_URL
expect_failure missing-request-url --audience workload
export ACTIONS_ID_TOKEN_REQUEST_URL='https://tokens.example.test/oidc'

unset ACTIONS_ID_TOKEN_REQUEST_TOKEN
expect_failure missing-request-token --audience workload
export ACTIONS_ID_TOKEN_REQUEST_TOKEN='request-token'

export MOCK_CURL_EXIT=22
expect_failure curl-failure --audience workload
unset MOCK_CURL_EXIT

printf '%s' '{}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure missing-value --audience workload

printf '%s' '{"value":""}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure empty-value --audience workload

printf '%s' '{"value":42}' > "${MOCK_CURL_RESPONSE_FILE}"
expect_failure non-string-value --audience workload

printf 'PASS: github-oidc-credential\n'
