import type { Plugin } from '@opencode/plugin/tui';
import { pathToFiletype, SyntaxStyle } from '@opentui/core';

type Color = unknown;
interface HostTheme {
  text?: {
    base?: Color;
    muted?: Color;
    feedback?: Record<'error' | 'warning' | 'success' | 'info', { base?: Color } | undefined>;
  };
  syntax?: Record<string, Color>;
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

/** Tree-sitter scopes for each of the host theme's syntax colours. */
const scopes: Record<string, string[]> = {
  comment: ['comment'],
  keyword: ['keyword', 'string.escape', 'tag.attribute'],
  function: ['function', 'constructor', 'variable.member'],
  type: ['type', 'module', 'class', 'namespace'],
  number: ['number', 'boolean', 'constant', 'float'],
  operator: ['operator', 'punctuation.delimiter', 'punctuation.special'],
  punctuation: ['punctuation'],
  string: ['string', 'character'],
  variable: ['variable', 'property', 'parameter'],
};

let cached: { theme: unknown; style: SyntaxStyle } | undefined;

/** Code colours from the host theme, or nothing when the host does not expose them. */
export function syntaxStyle(ctx: Plugin.Context): SyntaxStyle | undefined {
  const syntax = (ctx.theme as HostTheme | undefined)?.syntax;
  if (!syntax) return undefined;
  if (cached && cached.theme === ctx.theme) return cached.style;
  cached?.style.destroy();
  const styles: Record<string, { fg?: any; bold?: boolean; italic?: boolean }> = {
    'markup.strong': { bold: true },
    'markup.italic': { italic: true },
    'markup.raw': { fg: syntax.string },
  };
  for (const [name, names] of Object.entries(scopes))
    if (syntax[name]) for (const scope of names) styles[scope] = { fg: syntax[name] };
  cached = { theme: ctx.theme, style: SyntaxStyle.fromStyles(styles, ctx.renderer.nativeScene) };
  return cached.style;
}

export { pathToFiletype };
