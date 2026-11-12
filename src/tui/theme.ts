import type { Plugin } from '@opencode/plugin/tui';

type Color = unknown;
interface HostTheme {
  text?: {
    base?: Color;
    muted?: Color;
    feedback?: Record<'error' | 'warning' | 'success' | 'info', { base?: Color } | undefined>;
  };
}

/** Fallbacks for hosts that do not expose a resolved theme. */
const fallback = {
  text: '#e0e0e0',
  accent: '#9be4c6',
  muted: '#b5b5b5',
  error: '#ffb3b3',
  warning: '#ebc28c',
  success: '#9be4c6',
};

export type Colors = Record<keyof typeof fallback, () => any>;

/** Host theme colours, read lazily so theme switches apply on the next render. */
export function colors(ctx: Plugin.Context): Colors {
  const theme = () => (ctx.theme ?? {}) as HostTheme;
  const feedback = (name: 'error' | 'warning' | 'success' | 'info') =>
    theme().text?.feedback?.[name]?.base;
  return {
    text: () => theme().text?.base ?? fallback.text,
    accent: () => feedback('info') ?? fallback.accent,
    muted: () => theme().text?.muted ?? fallback.muted,
    error: () => feedback('error') ?? fallback.error,
    warning: () => feedback('warning') ?? fallback.warning,
    success: () => feedback('success') ?? fallback.success,
  };
}
