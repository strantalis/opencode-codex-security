import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

let ready: Promise<typeof import('@openai/codex-security')> | undefined;

/**
 * The SDK, with its bundled helper module already loaded.
 *
 * On load the helper compares `process.argv[1]` with its own path to see whether it is the main
 * script. Inside OpenCode's compiled binary that argument is a virtual path that exists but
 * cannot be resolved, so the load throws, and the SDK reports it as a scan that "completed
 * without required artifacts". Loading the helper once with the argument blanked avoids that;
 * later imports reuse the loaded module.
 */
export function loadSdk() {
  return (ready ??= (async () => {
    const sdk = await import('@openai/codex-security');
    const helper = pathToFileURL(join(await sdk.bundledPluginRoot(), 'mcp/helpers.mjs')).href;
    const invoked = process.argv[1];
    process.argv[1] = '';
    try {
      await import(helper);
    } finally {
      process.argv[1] = invoked!;
    }
    return sdk;
  })());
}
