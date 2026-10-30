"""Execute target resolution and Make variables; check the workflow dependency contract."""
import os
import subprocess
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]


class ShowcaseTests(unittest.TestCase):
    def test_workflow_is_opt_in_main_only_and_parallel_to_tests(self):
        text = (ROOT / '.github/workflows/p2p-workflow-fastfeedback.yaml').read_text()
        definition = text.split('      showcase:', 1)[1].split('      dry-run:', 1)[0]
        self.assertIn('type: boolean', definition)
        self.assertIn('default: false', definition)
        job = text.split('  showcase:\n', 1)[1].split('\n  functional-test:', 1)[0]
        self.assertIn("if: ${{ inputs.showcase && github.event_name != 'pull_request' && github.event_name != 'pull_request_target' && github.ref == inputs.main-branch }}", job)
        self.assertIn('needs: [resolve-targets, build]', job)
        self.assertIn('version: ${{ inputs.version }}', job)
        self.assertIn('subnamespace: showcase', job)
        for name in ('integration-test', 'promote'):
            needs = text.split('  ' + name + ':\n', 1)[1].splitlines()[0]
            self.assertNotIn('showcase', needs)
        self.assertIn('showcase', text.split('  notify-failure:\n', 1)[1].splitlines()[0])
        self.assertIn("showcase: ${{ inputs.showcase && github.event_name != 'pull_request' && github.event_name != 'pull_request_target' && github.ref == inputs.main-branch }}", text)

    def test_pull_request_events_never_allocate_or_deploy_even_with_matching_ref(self):
        text = (ROOT / '.github/workflows/p2p-workflow-fastfeedback.yaml').read_text()
        expression = text.split('  showcase:\n    if: ${{ ', 1)[1].split(' }}', 1)[0]
        expression = (expression.replace('inputs.showcase', 'enabled')
                      .replace('github.event_name', 'event').replace('github.ref', 'ref')
                      .replace('inputs.main-branch', 'main').replace('&&', 'and'))
        for event in ('push', 'workflow_dispatch', 'pull_request', 'pull_request_target'):
            for enabled in (False, True):
                for ref, main in (('refs/heads/main', 'refs/heads/main'),
                                  ('refs/pull/1/merge', 'refs/pull/1/merge'),
                                  ('refs/heads/feature', 'refs/heads/main')):
                    with self.subTest(event=event, enabled=enabled, ref=ref, main=main):
                        actual = eval(expression, {'__builtins__': {}},
                                      dict(event=event, enabled=enabled, ref=ref, main=main))
                        self.assertEqual(actual, enabled and event in ('push', 'workflow_dispatch') and ref == main)

    def test_resolver_sends_flag_only_when_enabled(self):
        text = (ROOT / '.github/workflows/p2p-resolve-targets.yaml').read_text()
        script = '\n'.join(line[10:] for line in text.split('        run: |\n', 1)[1].splitlines())
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory)
            cli = path / 'corectl'
            cli.write_text('#!/bin/bash\nprintf "%s\\n" "$@" > "$ARGS"\nprintf \'%s\' \'{"fastFeedback":{"include":[{"deploy_env":"ff"}]},"extendedTest":{"include":[{"deploy_env":"et"}]}}\'\n')
            cli.chmod(0o755)
            for flag in ('false', 'true'):
                env = dict(os.environ, PATH=directory + ':' + os.environ['PATH'], ARGS=str(path/'args'),
                           CORECTL_CONTEXT='instance/context', CORECTL_PORTAL_URL='https://portal.example', APP_NAME='app',
                           SOURCE_STAGE='fastFeedback', DESTINATION_STAGE='extendedTest', SHOWCASE=flag,
                           GITHUB_OUTPUT=str(path/'output'))
                result = subprocess.run(['bash', '-c', script], env=env, capture_output=True, text=True)
                self.assertEqual(result.returncode, 0, result.stderr)
                self.assertEqual('--showcase' in (path/'args').read_text().splitlines(), flag == 'true')

    def test_showcase_uses_application_image_in_ff_namespace(self):
        with tempfile.TemporaryDirectory() as directory:
            makefile = Path(directory) / 'Makefile'
            makefile.write_text(f'include {ROOT}/p2p.mk\nprint-showcase:\n\t@echo $(p2p_namespace) $(p2p_image_tag) $(p2p_app_url_suffix)\n')
            result = subprocess.run(['make', '-s', '-f', str(makefile), 'print-showcase',
                                     'P2P_APP_NAME=app', 'P2P_TENANT_NAME=team', 'P2P_VERSION=v123',
                                     'P2P_REGISTRY_FAST_FEEDBACK=registry/team/app/fast-feedback'],
                                    cwd=directory, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn('team-app-showcase registry/team/app/fast-feedback/app:v123 -showcase', result.stdout)


if __name__ == '__main__':
    unittest.main()
