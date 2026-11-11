import { execFile } from 'node:child_process';
import { routeFrom, withSdk, type Route } from './scan-plan.ts';
import { codexConfigPath, codexProfiles, loadSettings } from './settings.ts';

/** The resolved setup, read without preparing a scan. */
export interface SetupStatus {
  route: Route;
  configFile: string;
  codexConfigFile: string;
  profile?: string;
  profiles: string[];
  runtime: { node: string | null; python: string | null };
}

/** The version a command on the process PATH reports, or null when it is missing. */
const version = (command: string) =>
  new Promise<string | null>((resolve) =>
    execFile(command, ['--version'], { timeout: 5000 }, (error, stdout, stderr) =>
      resolve(error ? null : (/\d+\.\d+\.\d+/.exec(`${stdout} ${stderr}`)?.[0] ?? null)),
    ),
  );

/** Offline: the SDK's preflight resolves the route against the workspace, and nothing runs. */
export async function setupStatus(workspace: string): Promise<SetupStatus> {
  const settings = await loadSettings();
  const [route, profiles, node, python] = await Promise.all([
    withSdk(settings.codex, async (client, sdk) =>
      routeFrom(sdk, settings.codex, await client.preflight(workspace, { auth: settings.auth })),
    ),
    codexProfiles(),
    version('node'),
    version('python3'),
  ]);
  return {
    route,
    configFile: settings.path,
    codexConfigFile: codexConfigPath(),
    ...(settings.profile ? { profile: settings.profile } : {}),
    profiles,
    runtime: { node, python },
  };
}
