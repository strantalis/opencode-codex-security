import { Plugin } from '@opencode/plugin';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import { Security } from './rpc.ts';
import { PlannedScanService } from './core/planned-scan.ts';
import type { ScanInputs } from './core/scan-plan.ts';
import {
  SecurityOperationsService,
  type SecurityOperationsFactory,
  type SecurityOperationInputs,
} from './core/security-operations.ts';
import type { SecurityFactory } from './core/codex-adapter.ts';
import { userMessage } from './core/errors.ts';
import { saveProfile } from './core/settings.ts';
import { setupStatus } from './core/status.ts';
import { registerTools, sessionNotices } from './tools.ts';
import { skill } from './skill.ts';

type SkillInfo = Parameters<
  Parameters<Parameters<Plugin.Context['skill']['transform']>[0]>[0]['add']
>[0];

type RpcContext = {
  error: (type: 'security.setup', message: string, data: Record<string, never>) => unknown;
};
/** Input and SDK setup problems reach the UI as written; anything else stays generic. */
const rpc =
  <I, T>(action: (input: I) => T | Promise<T>) =>
  async (input: unknown, context: RpcContext) => {
    try {
      return await action(input as I);
    } catch (error) {
      const message = userMessage(error, '');
      if (message) return context.error('security.setup', message, {}) as never;
      throw new Error('Security request failed.', { cause: error });
    }
  };

// Client injection exists for the offline test harness only.
export function createSecurityPlugin(
  testOptions: {
    createClient?: SecurityFactory;
    createOperationsClient?: SecurityOperationsFactory;
  } = {},
) {
  return Plugin.define({
    id: 'gill.security',
    async setup(ctx) {
      if (ctx.options.engine !== undefined && ctx.options.engine !== 'codex')
        throw new Error('The fixture engine was removed. Delete the "engine" plugin option.');
      const directory = ctx.location.directory;
      const scans = new PlannedScanService(directory, {
        ...testOptions,
        mock: !!testOptions.createClient,
        historyDirectory:
          testOptions.createClient && !process.env.XDG_STATE_HOME
            ? undefined
            : join(
                process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'),
                'opencode',
                'codex-security',
                'runs',
                createHash('sha256').update(directory).digest('hex').slice(0, 24),
              ),
      });
      // A scan-only mock leaves operations off rather than letting them reach the real SDK.
      const operations =
        !testOptions.createClient || testOptions.createOperationsClient
          ? new SecurityOperationsService(directory, {
              createClient: testOptions.createOperationsClient,
              mock: !!testOptions.createOperationsClient,
            })
          : undefined;
      const requireOperations = () => {
        if (!operations) throw new Error('Policy and validation are unavailable in this host.');
        return operations;
      };
      const registration = await ctx.rpc.register(Security, {
        capabilities: async () => ({
          scan: true,
          policy: !!operations,
          validation: !!operations,
          questionAnswers: !!operations,
          fix: !!operations,
        }),
        prepare: rpc((input: ScanInputs) => scans.prepare(input)),
        start: rpc((input: { planId?: string }) => scans.start(input)),
        list: rpc(() => scans.list()),
        status: rpc(async (input: { runId?: string; planId?: string }) => {
          await scans.ready();
          return scans.getState(input);
        }),
        cancel: rpc((input: { runId?: string }) => scans.cancel(input)),
        operationPrepare: rpc((input: SecurityOperationInputs) =>
          requireOperations().prepare(input),
        ),
        operationStart: rpc((input: { operationId: string }) => requireOperations().start(input)),
        operationStatus: rpc((input: { operationId: string }) =>
          requireOperations().getState(input.operationId),
        ),
        operationList: rpc(() => ({
          operations: operations?.list() ?? [],
          maxConcurrent: operations?.maxConcurrent ?? 0,
        })),
        operationAnswer: rpc((input: { operationId: string; questionId: string; answer: string }) =>
          requireOperations().answer(input),
        ),
        operationCancel: rpc((input: { operationId: string }) =>
          requireOperations().cancel(input.operationId),
        ),
        operationResolve: rpc((input: { operationId: string; action: 'apply' | 'discard' }) =>
          requireOperations().resolve(input),
        ),
        setup: rpc(() => setupStatus(directory)),
        setProfile: rpc((input: { profile: string }) => saveProfile(input.profile)),
      });
      const notices = sessionNotices(ctx, scans, operations);
      const tools = await ctx.tool.transform((editor) =>
        registerTools(editor, ctx, scans, operations, notices, () => setupStatus(directory)),
      );
      const skills = await ctx.skill.transform((editor) => editor.add(skill as SkillInfo));
      let pending = Promise.resolve();
      const unsubscribe = scans.subscribe((state) => {
        pending = pending
          .then(() => registration.events.emit('changed', { ...state }))
          .catch(() => {});
      });
      const unsubscribeOperations = operations?.subscribe((state) => {
        pending = pending
          .then(() => registration.events.emit('operationChanged', { ...state }))
          .catch(() => {});
      });
      return async () => {
        unsubscribe();
        unsubscribeOperations?.();
        // Before disposal cancels running work: shutdown must not wake sessions.
        await notices.dispose();
        await operations?.dispose();
        await scans.dispose();
        await pending;
        await skills.dispose();
        await tools.dispose();
        await registration.dispose();
      };
    },
  });
}
export default createSecurityPlugin();
