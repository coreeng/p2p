#!/usr/bin/env bash

set -euo pipefail

script_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
runner="${script_dir}/../pinniped-auth-evidence"
tmp_dir="$(mktemp -d)"
trap 'rm -rf "${tmp_dir}"' EXIT

fail() {
  printf 'FAIL: %s\n' "$1" >&2
  exit 1
}

[[ -x "${runner}" ]] || fail "runner does not exist or is not executable: ${runner}"

mock_bin="${tmp_dir}/bin"
runner_temp="${tmp_dir}/runner-temp"
mkdir -p "${mock_bin}" "${runner_temp}"

cat > "${mock_bin}/curl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'BEGIN\n'
  printf '%s\n' "$@"
  printf 'END\n'
} >> "${MOCK_CURL_ARGS_FILE}"

output_file=''
write_out=''
while (($# > 0)); do
  case "$1" in
    --output)
      output_file="$2"
      shift 2
      ;;
    --write-out)
      write_out="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done
[[ -z "${output_file}" ]] || printf '%s' "${MOCK_CURL_RESPONSE_BODY}" > "${output_file}"
[[ -z "${write_out}" ]] || printf '%s' "${MOCK_CURL_HTTP_STATUS}"
EOF

cat > "${mock_bin}/kubectl" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'BEGIN\n'
  printf '%s\n' "$@"
  printf 'END\n'
} >> "${MOCK_KUBECTL_ARGS_FILE}"

case "$*" in
  "--kubeconfig ${RUNNER_TEMP}/pinniped-kubeconfig."*" auth can-i create deployments.apps --namespace auth-test-2")
    printf 'yes\n'
    ;;
  "--kubeconfig ${RUNNER_TEMP}/pinniped-kubeconfig."*" auth can-i get pods --namespace kube-system"|\
  "--kubeconfig ${RUNNER_TEMP}/pinniped-kubeconfig."*" auth can-i get pods --namespace cecg-system")
    printf 'no\n'
    exit 1
    ;;
  "--kubeconfig ${RUNNER_TEMP}/pinniped-kubeconfig."*" auth can-i get pods --namespace status-2")
    printf 'no\n'
    exit 2
    ;;
  "--kubeconfig ${RUNNER_TEMP}/pinniped-kubeconfig."*" auth can-i get pods --namespace malformed-output")
    printf 'unknown\n'
    ;;
  *" auth can-i "*)
    printf 'unexpected auth can-i invocation: %s\n' "$*" >&2
    exit 2
    ;;
esac
EOF

cat > "${mock_bin}/pinniped" <<'EOF'
#!/usr/bin/env bash
set -euo pipefail
{
  printf 'BEGIN\n'
  printf '%s\n' "$@"
  printf 'END\n'
} >> "${MOCK_PINNIPED_ARGS_FILE}"
if [[ -n "${MOCK_PINNIPED_ERROR:-}" ]]; then
  printf '%s\n' "${MOCK_PINNIPED_ERROR}" >&2
  exit 1
fi
if [[ "${MOCK_PINNIPED_REJECT:-false}" == 'true' ]]; then
  printf 'Error: whoami failed: could not complete Concierge credential exchange: login failed: authentication failed: token rejected by authenticator\n' >&2
  exit 1
fi
EOF

chmod +x "${mock_bin}/curl" "${mock_bin}/kubectl" "${mock_bin}/pinniped"

assert_contains_line() {
  local expected="$1"
  local file="$2"
  grep -Fxq -- "${expected}" "${file}" || fail "expected ${file} to contain line '${expected}'"
}

assert_excludes() {
  local unexpected="$1"
  local file="$2"
  if [[ -f "${file}" ]] && grep -Fq -- "${unexpected}" "${file}"; then
    fail "expected ${file} not to contain '${unexpected}'"
  fi
}

reset_mocks() {
  local case_name="$1"
  export MOCK_CURL_ARGS_FILE="${tmp_dir}/${case_name}.curl-args"
  export MOCK_KUBECTL_ARGS_FILE="${tmp_dir}/${case_name}.kubectl-args"
  export MOCK_PINNIPED_ARGS_FILE="${tmp_dir}/${case_name}.pinniped-args"
  : > "${MOCK_CURL_ARGS_FILE}"
  : > "${MOCK_KUBECTL_ARGS_FILE}"
  : > "${MOCK_PINNIPED_ARGS_FILE}"
  RUN_OUTPUT_FILE="${tmp_dir}/${case_name}.output"
}

run_runner() {
  local case_name="$1"
  shift
  reset_mocks "${case_name}"
  set +e
  PATH="${mock_bin}:${PATH}" \
    RUNNER_TEMP="${runner_temp}" \
    PINNIPED_ENDPOINT='https://pinniped.example.test' \
    PINNIPED_CA_BUNDLE='Y2VydA==' \
    MOCK_CURL_RESPONSE_BODY="${MOCK_CURL_RESPONSE_BODY:-{\"kind\":\"Status\",\"reason\":\"Unauthorized\",\"code\":401}}" \
    MOCK_CURL_HTTP_STATUS="${MOCK_CURL_HTTP_STATUS:-401}" \
    "${runner}" "$@" > "${RUN_OUTPUT_FILE}" 2>&1
  RUN_STATUS=$?
  set -e
}

run_runner success \
  --audience=core-platform:sandbox-3-gcp:auth-test-2 \
  --authenticator=github-actions-auth-test-2 \
  --expect-authentication=success \
  --allow=create,deployments.apps,auth-test-2 \
  --deny=get,pods,kube-system \
  --deny=get,pods,cecg-system
[[ ${RUN_STATUS} -eq 0 ]] || fail "success case failed: $(cat "${RUN_OUTPUT_FILE}")"
assert_contains_line 'Pinniped authentication succeeded' "${RUN_OUTPUT_FILE}"
assert_contains_line 'ALLOW create deployments.apps in auth-test-2: yes' "${RUN_OUTPUT_FILE}"
assert_contains_line 'DENY get pods in kube-system: no' "${RUN_OUTPUT_FILE}"
assert_contains_line 'DENY get pods in cecg-system: no' "${RUN_OUTPUT_FILE}"
assert_contains_line '--output' "${MOCK_CURL_ARGS_FILE}"
assert_contains_line '--write-out' "${MOCK_CURL_ARGS_FILE}"
assert_contains_line '%{http_code}' "${MOCK_CURL_ARGS_FILE}"
assert_contains_line '--cacert' "${MOCK_CURL_ARGS_FILE}"
assert_excludes '--fail' "${MOCK_CURL_ARGS_FILE}"
assert_excludes '/dev/null' "${MOCK_CURL_ARGS_FILE}"
assert_contains_line '--exec-api-version=client.authentication.k8s.io/v1beta1' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-interactive-mode=Never' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--audience=core-platform:sandbox-3-gcp:auth-test-2' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--enable-concierge' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--concierge-api-group-suffix=pinniped.dev' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--concierge-authenticator-name=github-actions-auth-test-2' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--concierge-authenticator-type=jwt' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line '--exec-arg=--credential-cache=' "${MOCK_KUBECTL_ARGS_FILE}"
assert_contains_line 'whoami' "${MOCK_PINNIPED_ARGS_FILE}"
assert_contains_line '--kubeconfig' "${MOCK_PINNIPED_ARGS_FILE}"
assert_excludes 'core-platform:sandbox-3-gcp:auth-test-2' "${RUN_OUTPUT_FILE}"
assert_excludes 'github-actions-auth-test-2' "${RUN_OUTPUT_FILE}"
assert_excludes 'Y2VydA==' "${RUN_OUTPUT_FILE}"
[[ -z "$(ls -A "${runner_temp}")" ]] || fail 'success case left temporary artifacts'

run_runner invalid-authorization-status \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success \
  --deny=get,pods,status-2
[[ ${RUN_STATUS} -ne 0 ]] || fail 'authorization status 2 unexpectedly produced evidence'
assert_excludes 'DENY get pods in status-2' "${RUN_OUTPUT_FILE}"

run_runner malformed-authorization-output \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success \
  --deny=get,pods,malformed-output
[[ ${RUN_STATUS} -ne 0 ]] || fail 'malformed authorization output unexpectedly produced evidence'
assert_excludes 'DENY get pods in malformed-output' "${RUN_OUTPUT_FILE}"

export MOCK_PINNIPED_REJECT=true
run_runner rejected \
  --audience=core-platform:sandbox-3-gcp:cecg-system \
  --authenticator=github-actions-cecg-system \
  --expect-authentication=rejected
unset MOCK_PINNIPED_REJECT
[[ ${RUN_STATUS} -eq 0 ]] || fail "rejection case failed: $(cat "${RUN_OUTPUT_FILE}")"
[[ "$(cat "${RUN_OUTPUT_FILE}")" == 'EXPECTED: Pinniped authentication rejected' ]] || \
  fail 'rejection case did not emit only the sanitized expected-rejection label'
assert_excludes 'could not complete Concierge credential exchange' "${RUN_OUTPUT_FILE}"
assert_excludes 'authentication failed' "${RUN_OUTPUT_FILE}"
assert_excludes 'core-platform:sandbox-3-gcp:cecg-system' "${RUN_OUTPUT_FILE}"
[[ -z "$(ls -A "${runner_temp}")" ]] || fail 'rejection case left temporary artifacts'

export MOCK_CURL_RESPONSE_BODY='arbitrary TLS-valid service'
export MOCK_CURL_HTTP_STATUS=200
export MOCK_PINNIPED_REJECT=true
run_runner non-kubernetes-endpoint \
  --audience=core-platform:sandbox-3-gcp:cecg-system \
  --authenticator=github-actions-cecg-system \
  --expect-authentication=rejected
unset MOCK_CURL_RESPONSE_BODY MOCK_CURL_HTTP_STATUS MOCK_PINNIPED_REJECT
[[ ${RUN_STATUS} -ne 0 ]] || fail 'non-Kubernetes endpoint unexpectedly accepted'
[[ ! -s "${MOCK_PINNIPED_ARGS_FILE}" ]] || fail 'non-Kubernetes endpoint invoked pinniped'
assert_excludes 'arbitrary TLS-valid service' "${RUN_OUTPUT_FILE}"
[[ -z "$(ls -A "${runner_temp}")" ]] || fail 'non-Kubernetes endpoint left temporary artifacts'

export MOCK_PINNIPED_ERROR='Unauthorized'
run_runner generic-unauthorized \
  --audience=core-platform:sandbox-3-gcp:cecg-system \
  --authenticator=github-actions-cecg-system \
  --expect-authentication=rejected
unset MOCK_PINNIPED_ERROR
[[ ${RUN_STATUS} -ne 0 ]] || fail 'generic Unauthorized whoami failure unexpectedly accepted'
assert_excludes 'Unauthorized' "${RUN_OUTPUT_FILE}"

expect_preflight_failure() {
  local case_name="$1"
  shift
  run_runner "${case_name}" "$@"
  [[ ${RUN_STATUS} -ne 0 ]] || fail "${case_name} unexpectedly succeeded"
  [[ ! -s "${MOCK_CURL_ARGS_FILE}" ]] || fail "${case_name} invoked curl"
  [[ ! -s "${MOCK_KUBECTL_ARGS_FILE}" ]] || fail "${case_name} invoked kubectl"
  [[ ! -s "${MOCK_PINNIPED_ARGS_FILE}" ]] || fail "${case_name} invoked pinniped"
}

expect_preflight_failure duplicate-empty-audience \
  --audience= --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success
expect_preflight_failure duplicate-empty-authenticator \
  --audience=audience \
  --authenticator= --authenticator=authenticator \
  --expect-authentication=success
expect_preflight_failure duplicate-empty-expectation \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication= --expect-authentication=success
expect_preflight_failure trailing-authorization-field \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success \
  --allow=create,deployments.apps,namespace,
expect_preflight_failure missing-authorization-field \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success \
  --allow=create,deployments.apps
expect_preflight_failure empty-authorization-field \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=success \
  --allow=create,,namespace
expect_preflight_failure rejected-with-allow \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=rejected \
  --allow=create,deployments.apps,namespace
expect_preflight_failure rejected-with-deny \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=rejected \
  --deny=get,pods,namespace

run_runner invalid-expectation \
  --audience=audience \
  --authenticator=authenticator \
  --expect-authentication=maybe
[[ ${RUN_STATUS} -ne 0 ]] || fail 'invalid expectation unexpectedly succeeded'
[[ ! -s "${MOCK_CURL_ARGS_FILE}" ]] || fail 'invalid expectation invoked curl'
[[ ! -s "${MOCK_KUBECTL_ARGS_FILE}" ]] || fail 'invalid expectation invoked kubectl'
[[ ! -s "${MOCK_PINNIPED_ARGS_FILE}" ]] || fail 'invalid expectation invoked pinniped'

reset_mocks missing-ca
set +e
PATH="${mock_bin}:${PATH}" \
  RUNNER_TEMP="${runner_temp}" \
  PINNIPED_ENDPOINT='https://pinniped.example.test' \
  "${runner}" \
    --audience=audience \
    --authenticator=authenticator \
    --expect-authentication=success > "${RUN_OUTPUT_FILE}" 2>&1
RUN_STATUS=$?
set -e
[[ ${RUN_STATUS} -ne 0 ]] || fail 'missing CA unexpectedly succeeded'
[[ ! -s "${MOCK_CURL_ARGS_FILE}" ]] || fail 'missing CA invoked curl'
[[ ! -s "${MOCK_KUBECTL_ARGS_FILE}" ]] || fail 'missing CA invoked kubectl'
[[ ! -s "${MOCK_PINNIPED_ARGS_FILE}" ]] || fail 'missing CA invoked pinniped'

printf 'PASS: Pinniped authentication evidence runner\n'
