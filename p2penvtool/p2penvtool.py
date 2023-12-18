#!/usr/bin/env python3
from argparse import ArgumentParser, RawDescriptionHelpFormatter
import sys
import subprocess
import json
import os.path
import logging
import urllib3
import requests
import traceback

import git_remote
from github3api import GitHubAPI
from google.cloud import dns
from google.cloud.resourcemanager import ProjectsClient
from tabulate import tabulate

requests.packages.urllib3.disable_warnings(
    requests.packages.urllib3.exceptions.InsecureRequestWarning)
urllib3.disable_warnings()

# Since we're all on macs we want to get rid of the request SSL warnings
if os.path.isfile("/opt/homebrew/etc/ca-certificates/cert.pem"):
    os.environ["REQUESTS_CA_BUNDLE"] = "/opt/homebrew/etc/ca-certificates/cert.pem"

BEARER_TOKEN = os.environ.get("GITHUB_BEARER_TOKEN", None)
# using an access token

VALID_STAGES = ['dev', 'test', 'staging', 'prod']

class CheckRelease:
    def __init__(self, arguments):
        self.args = self.__class__.defaults()
        self.args.update(arguments)
        self.repo = None
        self.repository_id = None
        self.github = None

        self.output = {}
        numeric_level = getattr(logging, self.args['log_level'].upper(), None)
        logging.getLogger().setLevel(numeric_level)

    @classmethod
    def defaults(cls):
        default_keys = {
            'log_level': 'info'
        }
        return default_keys

    @classmethod
    def setup_args(cls, arguments):
        parser = ArgumentParser(
            formatter_class=RawDescriptionHelpFormatter,
            description='''

Generate a set of github environment variables for specific DPLATFORM environments
from the available projects to the given user.


'''
        )
        defaults = cls.defaults()
        parser.set_defaults(**(cls.defaults()))
        parser.add_argument('--log-level', help="Logging level", default=defaults['log_level'])

        subparsers = parser.add_subparsers(dest='mode', help='sub-command help')
        subparsers.required = True

        show_parser = subparsers.add_parser('show', formatter_class=RawDescriptionHelpFormatter,
                                            help='show github environments')
        show_parser.description = '''
Show the current github environments and their associated variables.
        
This obtains currently defined DPLATFORMs and STAGEs for a given repository.
'''
        show_parser.add_argument('--repo', help="Github Repo")
        show_parser.add_argument('--show-perms', '-p', help="Show permissions", action="store_true")

        list_parser = subparsers.add_parser('list', formatter_class=RawDescriptionHelpFormatter,
                                            help='list gcloud dplatform environments')
        list_parser.description = '''
Shows the available dplatform environments for the given user.
'''

        trigger_parser = subparsers.add_parser('trigger', formatter_class=RawDescriptionHelpFormatter,
                                               help='trigger a github environment')
        trigger_parser.description = '''
Trigger a github workflow for the given environments.
'''
        trigger_parser.add_argument('env', nargs='+', help="envs to trigger")
        trigger_parser.add_argument('--repo', help="Github Repo")
        trigger_parser.add_argument('--workflow', '-w', help="Workflow filename", default="dispatch.yaml")
        trigger_parser.add_argument('--ref', '-r', help="Workflow git reference", default="main")

        set_parser = subparsers.add_parser('set', formatter_class=RawDescriptionHelpFormatter,
                                           help='configure github environment')
        set_parser.description = '''
Configure github environment variables for the given environments.
'''
        set_parser.add_argument('env', nargs='+', help="stage definition in form <stage>=<env>,<env>")
        set_parser.add_argument('--force', help="Force setting up unknown stages", action="store_true")
        set_parser.add_argument('--repo', help="Github Repo")
        set_parser.add_argument('--show-only', help="Show the environment variables that would be set", action="store_true")

        _args = vars(parser.parse_args(arguments))
        return _args

    @staticmethod
    def runcommand(cmd):
        proc = subprocess.Popen(cmd,
                                stdout=subprocess.PIPE,
                                stderr=subprocess.PIPE,
                                shell=True,
                                universal_newlines=True)
        std_out, std_err = proc.communicate()
        return proc.returncode, std_out, std_err

    def get_variables(self, env=None):
        if env:
            url = f'/repositories/{self.repository_id}/environments/{env}/variables?per_page=30'
        else:
            url = f'/repos/{self.repo}/actions/variables?per_page=30'
        result = self.github.get(url)

        varlist = {}
        for i in result.get('variables', []):
            varlist[i['name']] = i['value']
        return varlist

    def set_variables(self, varlist, env=None):
        if env:
            url = f'/repositories/{self.repository_id}/environments/{env}/variables'
        else:
            url = f'/repos/{self.repo}/actions/variables'

        existing_vars = self.get_variables(env)
        for k, v in varlist.items():
            if self.args.get('show_only'):
                print(f'{k}={v}')
                continue
            if k in existing_vars:
                logging.info(f'PATCH {url}/{k} k={k} v={v}')
                self.github.patch(f'{url}/{k}', json={'name': k, 'value': v})
            else:
                logging.info(f'POST {url} k={k} v={v}')
                self.github.post(url, json={'name': k, 'value': v})
        print('---')

    def get_environments(self):
        envs = {}
        url = f'/repositories/{self.repository_id}/environments'
        result = self.github.get(url)

        for i in result.get('environments', []):
            envs[i['name']] = i
        return envs

    def get_active_stages(self):
        stages = {}
        global_vars = self.get_variables()
        for k, v in global_vars.items():
            if not k.startswith('STAGE_'):
                continue
            stage_name = k[6:].lower()
            matrix = json.loads(v)
            for i in matrix.get('include', []):
                shortname = i.get('deploy_env', None)
                if shortname is None:
                    continue
                stages[shortname] = stages.get(shortname, []) + [stage_name]
        return stages

    def print_github_environments(self):
        headers = ['SHORTNAME', 'STAGE', 'PROJECT_ID', 'PROJECT_NUMBER', 'DPLATFORM', 'BASE_DOMAIN']
        envlist = self.get_environments()
        stages = self.get_active_stages()

        rows = []
        for shortname in sorted(envlist):
            varlist = self.get_variables(shortname)
            stage = ','.join(stages.get(shortname, ['-']))
            row = [
                shortname, stage,
                varlist.get('PROJECT_ID', 'UNKNOWN'),
                varlist.get('PROJECT_NUMBER', 'UNKNOWN'),
                varlist.get('DPLATFORM', 'UNKNOWN'),
                varlist.get('BASE_DOMAIN', 'UNKNOWN')
            ]
            rows.append(row)
        print(tabulate(rows, headers=headers, tablefmt='plain', numalign='left'))

        if self.args.get('show_perms', False) is False:
           return

        headers = ['SHORTNAME', 'PROT', 'SELF', 'REVIEWERS']
        rows = []
        for k, v in sorted(envlist.items()):
            rules = v.get('protection_rules', [])
            if rules == []:
                rows.append([k, 'N', '-', '-'])
                continue
            #print(rules)
            row = [k, 'Y', 'N' if rules[0]['prevent_self_review'] else 'Y', '']
            for i in rules[0]['reviewers']:
                row[3] = i.get('reviewer', {}).get('login', 'UNKNOWN')
                rows.append(row)
                row = ['', '', '', '']
        print("\n" + tabulate(rows, headers=headers, tablefmt='plain', colalign=('left', 'center', 'center',)))



    def print_projects(self):
        cmd = 'gcloud projects list  --filter "labels.shortname:*" --format "table(labels.shortname, project_id,project_number,labels.env)"'
        returncode, std_out, std_err = self.runcommand(cmd)
        print(std_out, end='')


    def parse_env(self, env):
        split = env.split('=')
        if len(split) == 1:
            return {'stage': None, 'envs': split[0]}
        if len(split) == 2:
            return {'stage': split[0], 'envs': split[1]}
        raise RuntimeError('Must be of form <stage>=<env>,<env>... or <env>,<env>...')

    def assert_environment(self, args):
        context = self.parse_env(args)
        stage = context['stage']
        envs = context['envs'].split(',')

        if stage not in VALID_STAGES and stage is not None and self.args.get('force', False) is False:
            raise RuntimeError(f"Invalid stage {stage}. Must be one of {VALID_STAGES} or set `--force` to override")

        protection_rules = {
            'prevent_self_review': True,
            'reviewers': [
                {'type': 'User', 'id': 'withnale'},
            ]
        }

        for project in ProjectsClient().search_projects():
            varlist = {}
            shortname = project.labels.get('shortname', '__UNDEFINED__')
            if shortname not in envs:
                continue

            env = shortname

            print(f"Asserting environment protection rules {shortname}")
            url = f'/repositories/{self.repository_id}/environments/{env}'
            result = self.github.put(url)
            print(result)


            print(f"Asserting environment specific variables for {shortname}")
            varlist['PROJECT_ID'] = project.project_id
            varlist['BASE_DOMAIN'] = '__UNDEFINED_BASE_DOMAIN__'
            varlist['DPLATFORM'] = project.labels.get('env', '__UNDEFINED_ENV__')
            varlist['PROJECT_NUMBER'] = project.name.split('/')[1]

            dns_client = dns.Client(project=project.project_id)
            zone = dns_client.zone('ingress-default')
            records = zone.list_resource_record_sets()
            for record in records:
                if record.record_type == 'SOA':
                    varlist['BASE_DOMAIN'] = record.name.rstrip('.')

            url = f'/repositories/{self.repository_id}/environments/{env}'
            self.github.put(url)

            self.set_variables(varlist, env=env)

        if stage is None:
            return

        print(f"Asserting matrix variable STAGE_{stage.upper()}")
        varlist = self.generate_stage_matrix(stage, envs)
        self.set_variables(varlist)

    def parse_params(self):
        self.repo = self.args.get('repo')
        if self.repo is None:
            try:
                for i in git_remote.remotes():
                    if i[0] != 'origin':
                        continue
                    prefix, suffix = i[1].split(':')
                    if prefix != "git@github.com":
                        continue
                    self.repo = suffix[:-4]
                    print(f'Dynamically setting repo to {self.repo}')
            except OSError:
                raise RuntimeError("Unable to determine repo. Please specify with --repo")

        result = self.github.get(f'/repos/{self.repo}')
        self.repository_id = result['id']


    def github_login(self):
        if BEARER_TOKEN is None:
            print("""
            This requires GITHUB_BEARER_TOKEN to be set. The easiest way to obtain a token
            is to install the github cli. On a mac perform the following:
            
              brew install gh
              gh auth login
              gh auth token 
            """)
            sys.exit(1)
        self.github = GitHubAPI(bearer_token=BEARER_TOKEN)

    def generate_stage_include(self, envs):
        stage_value = {"include": [{"deploy_env": i} for i in envs]}
        return stage_value

    def generate_stage_matrix(self, stage, envs):
        stage_value = self.generate_stage_include(envs)
        varlist = {
            f"STAGE_{stage.upper()}": json.dumps(stage_value)
        }
        return varlist

    def trigger_environments(self):
        workflow_id = self.args['workflow']
        varlist = {}
        for arg in self.args['env']:
            context = self.parse_env(arg)
            varlist.update(self.generate_stage_matrix(context['stage'], context['envs'].split(',')))

        envlist = self.get_environments()

        url = f'/repos/{self.repo}/actions/workflows/{workflow_id}/dispatches'
        post = {
            "ref": self.args['ref'],
            "inputs": varlist
        }
        print(f"triggering {url} -- {json.dumps(post)}")
        try:
            r = self.github.post(url, json=post, raw_response=True)
            if r.status_code == 204:
                print(f"triggered {url} -- {json.dumps(post)}")
        except requests.exceptions.HTTPError:
            print(traceback.format_exc())


    def run(self):
        self.github_login()
        self.parse_params()

        if self.args['mode'] == 'list':
            return self.print_projects()
        if self.args['mode'] == 'show':
            return self.print_github_environments()
        if self.args['mode'] == 'trigger':
            return self.trigger_environments()

        for i in self.args['env']:
            self.assert_environment(i)


def main():
    args = CheckRelease.setup_args(sys.argv[1:])
    cli = CheckRelease(args)
    try:
        sys.exit(cli.run())
    except RuntimeError as e:
        logging.error(str(e))
        sys.exit(1)


if __name__ == '__main__':
    main()
