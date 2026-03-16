# How to Pass Secrets and Environment Variables

P2P workflows expose two mechanisms for supplying secrets to your Makefile targets: `env_vars` for arbitrary key/value pairs and dedicated inputs for container registry credentials.

## Pass secrets as environment variables using `env_vars`

The `env_vars` secret accepts a multi-line string where each line is a `KEY=VALUE` pair. The workflow decodes these lines and exports them as environment variables available to every make target it runs.

1. Add your secrets to your repository under **Settings > Secrets and variables > Actions**.

2. Pass them to the workflow via the `env_vars` secret:

```yaml
secrets:
  env_vars: |
    DATABASE_URL=${{ secrets.DATABASE_URL }}
    API_KEY=${{ secrets.API_KEY }}
  # other secrets omitted
```

Each line becomes an environment variable in the runner, masked in logs.

### Caveat: `env_vars` supports single-line values only

`env_vars` splits on newlines to parse key/value pairs. Values containing newlines are parsed incorrectly.

This works:

```yaml
# This works
env_vars: |
  SECRET_KEY=abc123
  DB_HOST=postgres.example.com
```

This does not work:

```yaml
# This does NOT work — multi-line values are not supported
env_vars: |
  CERTIFICATE=-----BEGIN CERTIFICATE-----
  MIIBxTCCAWugAwIBAgIJAL...
  -----END CERTIFICATE-----
```

**Workaround:** Base64-encode multi-line values before storing them as secrets, then decode inside your Makefile:

```makefile
p2p-build:
    CERT=$$(echo "$$CERTIFICATE_B64" | base64 -d) && ...
```

Store the encoded value as `CERTIFICATE_B64` and pass it through `env_vars` as a single line.

## Use a private container registry

If your make targets need to pull images from a private registry (e.g., Docker Hub, a private GHCR), see [How to use a private container registry](use-a-private-container-registry.md).

## Reference

- [p2p-workflow-fastfeedback reference](../reference/p2p-workflow-fastfeedback.md) — full list of secrets and inputs
- [p2p-workflow-extended-test reference](../reference/p2p-workflow-extended-test.md) — full list of secrets and inputs
- [p2p-workflow-prod reference](../reference/p2p-workflow-prod.md) — full list of secrets and inputs
- [p2p-execute-command reference](../reference/p2p-execute-command.md) — underlying command executor secrets and inputs
