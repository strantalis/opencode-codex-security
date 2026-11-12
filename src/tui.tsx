/** @jsxImportSource @opentui/solid */
import { Plugin } from '@opencode/plugin/tui';
import type { SecurityOperationState } from './core/security-operations';
import { createApp, ROUTE } from './tui/app';

export default Plugin.define({
  id: 'opencode-codex-security.tui',
  setup(ctx) {
    const app = createApp(ctx);
    const unregister = ctx.ui.router.register({ name: ROUTE, render: () => <app.View /> });

    // The only thing that runs while the view is closed: an event listener that
    // tells the user when a policy draft is waiting on an answer.
    const asked = new Set<string>();
    const stopQuestions = app.store.client.events.on('operationChanged', (event) => {
      const op = event.data as unknown as SecurityOperationState;
      if (!op.question || asked.has(op.question.id)) return;
      asked.add(op.question.id);
      if (!app.onRoute())
        ctx.ui.toast.show({
          title: 'Security',
          message: 'A policy draft has a question for you. Open /security and press a.',
          variant: 'info',
        });
    });

    const command = (name: string, title: string, run: () => unknown) => ({
      id: `security.${name || 'open'}`,
      title,
      group: 'Security',
      palette: true as const,
      slash: { name: name ? `security-${name}` : 'security' },
      run: () => {
        app.open();
        void run();
      },
    });
    ctx.keymap.layer(() => ({
      mode: 'global',
      commands: [
        command('', 'Security: open', () => {}),
        command('scan', 'Security: new scan', app.newScan),
        command('validate', 'Security: validate a finding', app.validate),
      ],
    }));

    return () => {
      stopQuestions();
      app.store.dispose();
      unregister();
    };
  },
});
