# Install with an agent

Paste this into your coding agent on the machine where you use OpenCode, replacing `VERSION`:

```text
Install the OpenCode plugin opencode-codex-security@VERSION.

1. Check that the version exists: npm view opencode-codex-security@VERSION version
2. Add { "package": "opencode-codex-security@VERSION" } to the "plugins" array of my
   OpenCode config (~/.config/opencode/opencode.json, or under $XDG_CONFIG_HOME).
   Keep everything else in the file as it is.
3. Tell me to open /security in OpenCode to confirm it loaded.

Don't start a scan or change my model provider or credentials. If something is
missing, tell me what it is.
```

That is the whole install. The plugin takes its model and provider from your existing Codex config, and nothing runs until you approve a scan preview.

Before your first scan:

- OpenCode needs Node 22.20+ (or 24.x, 26.x) and Python 3.10+ on its `PATH`.
- If you sign in to Codex with ChatGPT, run `npx @openai/codex-security login` once so Codex Security has its own session. See [authentication](CONFIG.md#authentication).

To use a different model, provider or cost limit, see [CONFIG.md](CONFIG.md).
