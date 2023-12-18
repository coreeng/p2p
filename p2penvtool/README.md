# p2penvtool - managing p2p environment targets

p2penvtool is a tool to simplify the management of the environments that are targeted
by the path to production workflow. These require specific variables to be defined for
each specific developer platform target and to avoid this being an error prone manual
process, this tool will generate the required github environments based on the configured
visible environments for a given user.

## P2P Overview

As discussed in the ADR, it was felt beneficial to provide a looser coupling between
the path to production workflow and the environments that it targeted. This allows for
a greater number of use cases to be supported.

Most noteably:

- a logical separation between the tasks that need to be achieved to get to production
  and the environments that are targeted
- the path to production workflow can target 1 or more developer platform environments
  (henceforth referred to as DPLATFORMs) for a given STAGE.

Some specific use cases might be:

- in developing the path to production you might wish to target specific sandbox environments
  as part of the testing activities
- during internal testing of the latest platform version, you might wish to duplicate all
  dev or prod deployments to also be deployed to pre-dev
- during the final prepations of a migration of the prod DPLATFORM you might wish to parallel
  deploy all P2P applications to simplify the cut-over

The approach taken uses github environments to encapsulate the platforms specific configutation
and github matrices to allow these steps to be run for multiple environments.

The path to production workflow currently needs the following environment variables to be available:

| Variable         | Description                                                       |
|------------------|-------------------------------------------------------------------|
| `DPLATFORM`      | The name of the DPLATFORM that the workflow is targetting         |
| `PROJECT_ID`     | The project id of the project that the workflow is running in     | 
| `PROJECT_NUMBER` | The project number of the project that the workflow is running in |
| `STAGE`          | The name of the STAGE that the workflow is targetting             |
| `TENANT_NAME`    | The tenant name of the project that the workflow is running in    |

## Usage

This tool is written in python and makes use of standard argument parsing and associated help
messages. To see these messages please run `p2penvtool.py --help`

This tool provides four main functions:

- `list` - lists the DPLATFORMS that are available for a given user
- `set` - set the list of DPLATFORMS that will be provisioned for a given STAGE
- `show` - show the list of DPLATFORMS that will be provisioned for the associated STAGEs
- `trigger` - trigger the path to production workflow for an adhoc run

### What environments are available? `(list)`

To ascertain what environments are, you can use the `list` command. This will give you a view
similar to the standard `gloud projects list` command but with the addition of the DPLATFORM.

```console
bash-3.2$ ../p2p/p2penvtool/p2penvtool.py list
Dynamically setting repo to coreeng/p2p-testing
SHORTNAME       PROJECT_ID              PROJECT_NUMBER  ENV
cecg-sandbox-3  sandbox-3-30a19f54      666358633824    sandbox-3-gcp
cecg-sandbox-2  sandbox-2-90d712b5      187573789225    sandbox-2-gcp
cecg-sandbox-1  core-platform-ab0596fc  802275879062    sandbox-1-gcp
cecg-sandbox    core-platform-577499ab  908936296803    sandbox-gcp
cecg-pre-dev    core-platform-26f47174  958092298740    gcp-pre-dev
cecg-prod       core-platform-e0d5e766  465699379635    gcp-prod
cecg-dev        core-platform-efb3c84c  728565798160    gcp-dev
```

This provides a list of all the environments that are available to the user. The `STAGE` column
indicates the STAGE that the environment is associated with. The `DPLATFORM` column indicates
the DPLATFORM that the environment is associated with. The `BASE_DOMAIN` column indicates the
base domain that the environment is associated with.

The SHORTNAME column was introduced to eliminate ambiguity since the DPLATFORM field is not
unique and the PROJECT_ID is not particularly user friendly.

Both the DPLATFORM and SHORTNAME columns are populated by labels that have been applied to the project.
Only projects that the shortname label have been applied to will be listed.

### What environments are currently being targeted? `(show)`

To see what environments are being targeted for a given STAGE, you can use the `show` command.
This walks through the github environments associated with a given repository and lists the
environments that are associated with the given environment (SHORTNAME).

It also walks through the github matrix variables named `STAGE_{stage_name}` to determine what DPLATFORMs
are actually in use. Any DPLATFORMs that are not part of a stage can still be used as part of an "adhoc" 
pipeline run (initiated by the `trigger` command).

```console
bash-3.2$ ../p2p/p2penvtool/p2penvtool.py show
Dynamically setting repo to coreeng/p2p-testing
SHORTNAME       STAGE    PROJECT_ID              PROJECT_NUMBER    DPLATFORM      BASE_DOMAIN
cecg-dev        -        core-platform-efb3c84c  728565798160      gcp-dev        gcp-dev.cecg.platform.cecg.io
cecg-pre-dev    prod     core-platform-26f47174  958092298740      gcp-pre-dev    gcp-pre-dev.cecg.platform.cecg.io
cecg-prod       -        core-platform-e0d5e766  465699379635      gcp-prod       gcp-prod.cecg.platform.cecg.io
cecg-sandbox    -        core-platform-577499ab  908936296803      sandbox-gcp    sandbox-gcp.cecg.platform.cecg.io
cecg-sandbox-3  dev      sandbox-3-30a19f54      666358633824      sandbox-3-gcp  sandbox-3-gcp.sandboxes.cecg.platform.cecg.io
```


### Configuring the DPLATFORMs for given stages `(set)`

To configure the DPLATFORMs that are targetted for a given STAGE, you can use the `set` command.

This command takes a list of DPLATFORMs that are to be targetted for a given STAGE. It will
then create the required github environments and github matrix variables to allow the path to
production workflow to target these environments.

This takes parameters that take the form of `<stage>=<shortname1>,<shortname2>` and will

- lookup the PLATFORM_ID, PLATFORM_NUMBER from the project based on the SHORTNAME label
- lookup the DPLATFORM target based on the `env` label (should move this to dplatform label)
- lookup the BASE_DOMAIN based from the "ingress-default" managed zone within the project
- create the github environment and assert all of the associated variables
- create the github matrix variable `STAGE_<stage>` and assert all of the members

An example invocation is shown below:

```console
bash-3.2$ ../p2p/p2penvtool/p2penvtool.py set dev=cecg-sandbox-3 prod=cecg-pre-dev
Dynamically setting repo to coreeng/p2p-testing
Asserting environment specific variables for cecg-sandbox-3
INFO:root:PATCH /repositories/725511575/environments/cecg-sandbox-3/variables/PROJECT_ID k=PROJECT_ID v=sandbox-3-30a19f54
INFO:root:PATCH /repositories/725511575/environments/cecg-sandbox-3/variables/BASE_DOMAIN k=BASE_DOMAIN v=sandbox-3-gcp.sandboxes.cecg.platform.cecg.io
INFO:root:PATCH /repositories/725511575/environments/cecg-sandbox-3/variables/DPLATFORM k=DPLATFORM v=sandbox-3-gcp
INFO:root:PATCH /repositories/725511575/environments/cecg-sandbox-3/variables/PROJECT_NUMBER k=PROJECT_NUMBER v=666358633824
---
Asserting matrix variable STAGE_DEV
INFO:root:PATCH /repos/coreeng/p2p-testing/actions/variables/STAGE_DEV k=STAGE_DEV v={"include": [{"deploy_env": "cecg-sandbox-3"}]}
---
Asserting environment specific variables for cecg-pre-dev
INFO:root:PATCH /repositories/725511575/environments/cecg-pre-dev/variables/PROJECT_ID k=PROJECT_ID v=core-platform-26f47174
INFO:root:PATCH /repositories/725511575/environments/cecg-pre-dev/variables/BASE_DOMAIN k=BASE_DOMAIN v=gcp-pre-dev.cecg.platform.cecg.io
INFO:root:PATCH /repositories/725511575/environments/cecg-pre-dev/variables/DPLATFORM k=DPLATFORM v=gcp-pre-dev
INFO:root:PATCH /repositories/725511575/environments/cecg-pre-dev/variables/PROJECT_NUMBER k=PROJECT_NUMBER v=958092298740
---
Asserting matrix variable STAGE_PROD
INFO:root:PATCH /repos/coreeng/p2p-testing/actions/variables/STAGE_PROD k=STAGE_PROD v={"include": [{"deploy_env": "cecg-pre-dev"}]}
---
```

### Triggering an adhoc P2P run `(trigger)`

To trigger an adhoc P2P run, you can use the `trigger` command. This will trigger the path to
production workflow for the given STAGE and DPLATFORMs.

Obviously for "longer lived" requirements you would want the STAGE associations to be persisted 
in the workflow and this is the purpose of the `set` command. However, for adhoc runs when testing
new functionality, this command is a much better fit.

An example invocation is shown below:

```console
bash-3.2$ ../p2p/p2penvtool/p2penvtool.py trigger dev=cecg-sandbox prod=cecg-sandbox
Dynamically setting repo to coreeng/p2p-testing
triggered /repos/coreeng/p2p-testing/actions/workflows/dispatch.yaml/dispatches -- {"ref": "main", "inputs": {"STAGE_DEV": "{\"include\": [{\"deploy_env\": \"cecg-sandbox\"}]}", "STAGE_PROD": "{\"include\": [{\"deploy_env\": \"cecg-sandbox\"}]}"}}
```

