# Configuration

The plugin passes your settings to the Codex Security SDK and lets the SDK validate them. Every preview shows the provider, endpoint, model and credential source the SDK resolved. To check a change without preparing a scan, ask the session model to call `security_status`; it also lists your Codex profiles and the Node and Python versions it found.

## Where settings come from

1. **Your Codex config**, `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`). The plugin reads only the routing keys: `model`, `model_reasoning_effort`, `model_provider`, `model_providers`, `openai_base_url` and `daybreak`. If the file selects a profile with `profile = "name"`, that `[profiles.name]` table applies on top. MCP servers, hooks and everything else are ignored.
2. **`codex-security.json`**, in `$XDG_CONFIG_HOME/opencode/` (default `~/.config/opencode/`). Anything here overrides the Codex config. The file is optional.

There are no per-project settings. Each preview is a snapshot: a scan runs with the settings you approved, even if these two files change afterwards. The exception is a `name.config.toml` file profile, which the SDK reads when the scan starts.

## `codex-security.json`

```json
{
  "codex": {
    "model": "gpt-5.6-sol",
    "model_reasoning_effort": "high"
  },
  "auth": "auto",
  "scan": {
    "mode": "standard",
    "maxCostUsd": 5
  }
}
```

| Key              | Meaning                                                                                                                                                                                                             |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `codex`          | Native Codex config keys, passed to the SDK as `codexOverrides`. Set `profile` to choose a `[profiles.name]` table from your Codex config, or a `$CODEX_HOME/name.config.toml` file profile.                        |
| `auth`           | `auto` (default), `chatgpt` or `api-key`. See below.                                                                                                                                                                |
| `scan`           | SDK scan settings: `mode` (`standard` or `deep`), `maxCostUsd`, `maxTimeMinutes`, `cyberAccessProgram`, and the Deep settings `workers` and `subagents`. A mode chosen for one scan overrides `mode` for that scan. |
| `useCodexConfig` | Set to `false` to ignore your Codex config.                                                                                                                                                                         |

## Authentication

The SDK decides how to authenticate from the provider and the `auth` mode:

- **OpenAI, `auto`**: uses `OPENAI_API_KEY`, then `CODEX_API_KEY`, then your Codex Security sign-in.
- **OpenAI, `chatgpt`**: ignores API keys and uses the sign-in.
- **OpenAI, `api-key`**: requires one of the two keys.
- **A custom provider**: uses the environment variable named by its `env_key`.
- **Amazon Bedrock**: uses your AWS credential chain.

Environment variables must be visible to the OpenCode process. A desktop launch may not inherit what your shell exports, and the preview marks a key that is not set.

Codex Security keeps its own sign-in, separate from the Codex CLI. If it has none, the SDK copies your Codex CLI sign-in the first time it runs. The two then share one refresh token, and whichever refreshes second can be signed out. To avoid that, sign in once before your first scan. In the terminal view press `l`; in the Desktop panel use "Sign in with ChatGPT" on the setup card. Both run the SDK's own sign-in, in your browser or with a device code for a remote machine. From a shell, `npx @openai/codex-security login` does the same.

The sign-in prompt only appears when your route signs in with ChatGPT. With an API key, a gateway or Bedrock you never see it.

## Examples

A gateway that speaks the Responses API. If this provider is already in your Codex config, you need nothing here.

```json
{
  "codex": {
    "model": "your-gateway-model",
    "model_provider": "gateway",
    "model_providers": {
      "gateway": {
        "name": "Gateway",
        "base_url": "https://gateway.example.com/v1",
        "env_key": "GATEWAY_API_KEY",
        "wire_api": "responses"
      }
    }
  }
}
```

Amazon Bedrock:

```json
{
  "codex": {
    "model": "openai.gpt-daybreak-blue-5.6-sol",
    "model_provider": "amazon-bedrock",
    "model_providers": { "amazon-bedrock": { "aws": { "region": "us-east-2", "profile": "work" } } }
  }
}
```

Daybreak on OpenAI is `"daybreak": true` inside `codex`. On Bedrock it is selected by the model ID, as above. Neither setting grants access your account does not have.

## Cost limits

`scan.maxCostUsd` stops a scan or policy draft when the SDK's estimate passes the limit. Requests already in flight can exceed it. The SDK can only enforce a limit for models it has prices for, so a gateway alias it does not recognise fails at preview; remove the limit to run that model. Validation has no cost limit.
