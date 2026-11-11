import { execFile } from 'node:child_process';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, join, relative } from 'node:path';
import { promisify } from 'node:util';
import { SecurityInputError } from './errors.ts';

const run = promisify(execFile);
const git = async (cwd: string, ...args: string[]) =>
  (await run('git', args, { cwd, maxBuffer: 64 * 1024 * 1024 })).stdout;

/** A throwaway copy of the repository's last commit for the SDK to edit. */
export interface PatchWorkspace {
  /** The copy of the repository directory the fix was requested for. */
  directory: string;
  /** Everything the fix changed, as one diff against the last commit. */
  diff(): Promise<string>;
  /** Apply that diff to the real working tree. Throws if it no longer applies. */
  apply(): Promise<void>;
  remove(): Promise<void>;
}
export type PatchWorkspaceFactory = (repository: string, id: string) => Promise<PatchWorkspace>;

export async function gitRoot(repository: string) {
  try {
    return (await git(repository, 'rev-parse', '--show-toplevel')).trim();
  } catch {
    throw new SecurityInputError(
      'Proposing a fix needs a git repository with at least one commit.',
    );
  }
}

/** A detached git worktree under the cache directory, so the user's checkout is never edited. */
export const createPatchWorkspace: PatchWorkspaceFactory = async (repository, id) => {
  const root = await gitRoot(repository);
  const worktree = join(
    process.env.XDG_CACHE_HOME || join(homedir(), '.cache'),
    'opencode',
    'codex-security',
    'fixes',
    id,
  );
  const patch = `${worktree}.patch`;
  await mkdir(dirname(worktree), { recursive: true });
  try {
    await git(root, 'worktree', 'add', '--detach', worktree, 'HEAD');
  } catch {
    throw new SecurityInputError(
      'Proposing a fix needs a git repository with at least one commit.',
    );
  }
  const diff = async () => {
    await git(worktree, 'add', '-A');
    return git(worktree, 'diff', '--cached', '--binary', 'HEAD');
  };
  return {
    directory: join(worktree, relative(root, repository)),
    diff,
    async apply() {
      await writeFile(patch, await diff());
      try {
        await git(root, 'apply', '--whitespace=nowarn', patch);
      } catch {
        throw new SecurityInputError(
          'The fix no longer applies to your working tree. It was written against the last commit; commit or stash your changes and try again, or discard it.',
        );
      }
    },
    async remove() {
      await git(root, 'worktree', 'remove', '--force', worktree).catch(() =>
        rm(worktree, { recursive: true, force: true }),
      );
      await rm(patch, { force: true });
    },
  };
};
