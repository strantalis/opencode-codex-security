/**
 * Panel CSS, scoped under `.codex-security` and shipped inside the single-file GUI bundle.
 *
 * Colours come from the OpenCode Desktop v2 tokens (`--v2-*`), which the host defines for both
 * light and dark themes, then the older v1 tokens, then the panel's own fallback set below.
 */
export const securityStyles = `
/* ---------- Tokens ---------- */
.codex-security {
  --gs-f-bg: #161616;
  --gs-f-surface: #242424;
  --gs-f-fg: #fafafa;
  --gs-f-muted: #aeaeae;
  --gs-f-line: rgba(255, 255, 255, 0.1);
  --gs-f-line-strong: rgba(255, 255, 255, 0.2);
  --gs-f-hover: rgba(255, 255, 255, 0.06);
  --gs-f-accent-text: #a2bcff;
  --gs-f-success: #6bd586;
  --gs-f-warning: #f2cf76;
  --gs-f-danger: #f17471;
  --gs-f-danger-bg: #461516;
  --gs-f-danger-line: #97252b;

  --gs-bg: var(--v2-background-bg-base, var(--background-base, var(--gs-f-bg)));
  --gs-surface: var(--v2-background-bg-layer-01, var(--surface-raised-base, var(--gs-f-surface)));
  --gs-fg: var(--v2-text-text-base, var(--text-base, var(--gs-f-fg)));
  --gs-muted: var(--v2-text-text-muted, var(--text-weak, var(--gs-f-muted)));
  --gs-line: var(--v2-border-border-base, var(--border-base, var(--gs-f-line)));
  --gs-line-strong: var(--v2-border-border-strong, var(--gs-f-line-strong));
  --gs-hover: var(--v2-overlay-simple-overlay-hover, var(--gs-f-hover));
  --gs-focus: var(--v2-border-border-focus, #7698fd);
  --gs-accent: var(--v2-background-bg-accent, #3b5cf6);
  --gs-on-accent: var(--v2-text-text-contrast, #fff);
  --gs-accent-text: var(--v2-text-text-accent, var(--gs-f-accent-text));
  --gs-success: var(--v2-state-fg-success, var(--gs-f-success));
  --gs-warning: var(--v2-state-fg-warning, var(--gs-f-warning));
  --gs-danger: var(--v2-state-fg-danger, var(--gs-f-danger));
  --gs-danger-bg: var(--v2-state-bg-danger, var(--gs-f-danger-bg));
  --gs-danger-line: var(--v2-state-border-danger, var(--gs-f-danger-line));
  /* Yellow alone is too light on a light background; pull it toward the text colour. */
  --gs-warning-text: color-mix(in srgb, var(--gs-warning) 70%, var(--gs-fg));
  --gs-font-mono: var(--v2-font-family-code, ui-monospace, SFMono-Regular, Menlo, monospace);
  --gs-radius: 6px;
}
@media (prefers-color-scheme: light) {
  .codex-security {
    --gs-f-bg: #ffffff;
    --gs-f-surface: #fafafa;
    --gs-f-fg: #161616;
    --gs-f-muted: #5c5c5c;
    --gs-f-line: rgba(0, 0, 0, 0.1);
    --gs-f-line-strong: rgba(0, 0, 0, 0.2);
    --gs-f-hover: rgba(0, 0, 0, 0.04);
    --gs-f-accent-text: #3b5cf6;
    --gs-f-success: #198b43;
    --gs-f-warning: #cb9f34;
    --gs-f-danger: #b82d35;
    --gs-f-danger-bg: #fceceb;
    --gs-f-danger-line: #f2bbb7;
  }
}

/* ---------- Base ---------- */
.codex-security {
  height: 100%;
  overflow: auto;
  container-type: inline-size;
  background: var(--gs-bg);
  color: var(--gs-fg);
  font: inherit;
  font-size: 13px;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: var(--gs-line-strong) transparent;
}
.codex-security *,
.codex-security *::before,
.codex-security *::after {
  box-sizing: border-box;
}
.codex-security :where(h2, h3, h4, p, dl, dd, ol, ul, pre, fieldset) {
  margin: 0;
}
.codex-security :where(button, input, select, textarea) {
  font: inherit;
  color: inherit;
}
.codex-security button {
  cursor: pointer;
}
.codex-security button:disabled {
  cursor: not-allowed;
  opacity: 0.5;
}
.codex-security :focus-visible {
  outline: 2px solid var(--gs-focus);
  outline-offset: 2px;
}
.codex-security summary {
  display: flex;
  align-items: baseline;
  gap: 8px;
  cursor: pointer;
  list-style: none;
}
.codex-security summary::-webkit-details-marker {
  display: none;
}
/* One chevron for every disclosure, pointing down when open. */
.codex-security summary::before {
  content: '';
  flex-shrink: 0;
  align-self: center;
  width: 5px;
  height: 5px;
  margin: 0 3px 0 1px;
  border-right: 1.5px solid currentColor;
  border-bottom: 1.5px solid currentColor;
  transform: rotate(-45deg);
  opacity: 0.7;
}
.codex-security details[open] > summary::before {
  transform: rotate(45deg);
}
.gs-report {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.codex-security pre {
  font: 12px/1.6 var(--gs-font-mono);
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 360px;
  overflow: auto;
  padding: 10px 12px;
  background: var(--gs-surface);
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
}
.gs-body {
  display: flex;
  flex-direction: column;
  gap: 20px;
  max-width: 900px;
  margin: 0 auto;
  padding: 20px 24px 32px;
}

/* ---------- Utilities ---------- */
.gs-muted {
  color: var(--gs-muted);
}
.gs-mono {
  font-family: var(--gs-font-mono);
  font-size: 12px;
  overflow-wrap: anywhere;
}
.gs-wrap {
  overflow-wrap: anywhere;
}
.gs-block {
  display: block;
}
.gs-tabular {
  font-variant-numeric: tabular-nums;
}
.gs-danger {
  color: var(--gs-danger);
}

/* ---------- Buttons ---------- */
.gs-button {
  padding: 6px 12px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: transparent;
  line-height: 1.4;
  white-space: nowrap;
}
.gs-button:hover:not(:disabled) {
  background: var(--gs-hover);
}
.gs-button.gs-primary {
  border-color: transparent;
  background: var(--gs-accent);
  color: var(--gs-on-accent);
  font-weight: 600;
}
.gs-button.gs-primary:hover:not(:disabled) {
  filter: brightness(1.1);
}
.gs-link {
  padding: 2px 0;
  border: 0;
  background: none;
  color: var(--gs-accent-text);
  text-decoration: underline;
  text-underline-offset: 3px;
}
.gs-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px 12px;
  margin-top: 14px;
}

/* ---------- Notices ---------- */
.gs-alert {
  padding: 8px 12px;
  border: 1px solid var(--gs-danger-line);
  border-radius: var(--gs-radius);
  background: var(--gs-danger-bg);
  color: var(--gs-fg);
  overflow-wrap: anywhere;
}
.gs-note {
  margin-top: 12px;
  color: var(--gs-muted);
}
.gs-banner {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-empty h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 4px;
}
.gs-empty p {
  color: var(--gs-muted);
}
.gs-footer {
  font-size: 12px;
}

/* ---------- Header and tabs ---------- */
.gs-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.gs-header h2 {
  font-size: 18px;
  font-weight: 600;
  letter-spacing: -0.01em;
}
.gs-header p {
  font-size: 12px;
}
.gs-tabs {
  display: flex;
  gap: 20px;
  border-bottom: 1px solid var(--gs-line);
}
.gs-tabs button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-bottom: -1px;
  padding: 6px 0 10px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: none;
  color: var(--gs-muted);
  font-weight: 500;
}
.gs-tabs button:hover {
  color: var(--gs-fg);
}
.gs-tabs button[aria-current='page'] {
  color: var(--gs-fg);
  border-bottom-color: var(--gs-accent);
}
.gs-badge {
  min-width: 18px;
  padding: 0 5px;
  border-radius: 9px;
  background: var(--gs-accent);
  color: var(--gs-on-accent);
  font-size: 11px;
  line-height: 18px;
  text-align: center;
}

/* ---------- Setup card ---------- */
.gs-setup {
  padding: 0 14px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-setup > summary {
  gap: 10px;
  padding: 8px 0;
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-setup-line {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.gs-setup[open] {
  padding-bottom: 12px;
}
.gs-setup[open] > summary {
  margin-bottom: 4px;
}
.gs-setup > :not(summary) + :not(summary) {
  margin-top: 10px;
}
.gs-setup-grid {
  display: grid;
  grid-template-columns: max-content minmax(0, 1fr);
  gap: 6px 16px;
  align-items: baseline;
}
.gs-setup-grid dt {
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-setup-grid dd {
  overflow-wrap: anywhere;
}
.gs-select {
  max-width: 100%;
  padding: 3px 8px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: var(--gs-bg);
}

/* ---------- Disclosures and sections ---------- */
.gs-disclosure {
  margin-top: 10px;
}
.gs-disclosure > summary {
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-disclosure > summary:hover {
  color: var(--gs-fg);
}
.gs-disclosure[open] > summary {
  margin-bottom: 8px;
}
.gs-disclosure p + p {
  margin-top: 6px;
}
.gs-section {
  border-top: 1px solid var(--gs-line);
}
.gs-section > summary {
  padding: 12px 0;
  font-weight: 500;
}
.gs-section[open] {
  padding-bottom: 14px;
}
.gs-section[open] > summary {
  margin-bottom: 4px;
}
.gs-section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}
.gs-section-heading h3 {
  font-size: 14px;
  font-weight: 600;
}

/* ---------- Definition lists ---------- */
.gs-facts dt {
  margin-top: 10px;
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-facts dt:first-child {
  margin-top: 0;
}
.gs-facts dd {
  margin-top: 2px;
  overflow-wrap: anywhere;
}
/* Item rows under a counted heading, e.g. coverage surfaces. */
.gs-facts dd + dd {
  padding-left: 12px;
}

/* ---------- Forms ---------- */
.gs-form fieldset {
  min-width: 0;
  padding: 0;
  border: 0;
}
.gs-form label {
  display: block;
  margin-bottom: 14px;
  font-size: 12px;
  font-weight: 500;
}
.gs-form :where(input, textarea, select) {
  display: block;
  width: 100%;
  margin-top: 6px;
  padding: 7px 10px;
  border: 1px solid var(--gs-line-strong);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
  font-size: 13px;
  font-weight: 400;
  line-height: 1.5;
}
.gs-form :where(input, textarea, select):focus-visible {
  outline-offset: 0;
  border-color: var(--gs-focus);
}
.gs-form textarea {
  min-height: 64px;
  resize: vertical;
}
.gs-form ::placeholder {
  color: var(--gs-muted);
  opacity: 0.8;
}
.gs-help {
  display: block;
  margin-top: 4px;
  color: var(--gs-muted);
  font-weight: 400;
}

/* ---------- Composer and review ---------- */
.gs-composer {
  padding-bottom: 20px;
  border-bottom: 1px solid var(--gs-line);
}
.gs-composer:last-child {
  padding-bottom: 0;
  border-bottom: 0;
}
.gs-intro {
  margin: -4px 0 16px;
  color: var(--gs-muted);
}
.gs-composer > .gs-alert,
.gs-composer > p {
  margin-bottom: 14px;
}
.gs-review {
  padding: 14px 16px;
  border: 1px solid var(--gs-line);
  border-radius: 8px;
}
.gs-review h3 {
  margin-bottom: 12px;
  font-size: 14px;
  font-weight: 600;
}
.gs-approval {
  margin-top: 14px;
  padding-top: 12px;
  border-top: 1px solid var(--gs-line);
}
.gs-approval > p + p {
  margin-top: 6px;
}
.gs-approval .gs-disclosure p {
  color: var(--gs-muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

/* ---------- Lists (scan history, operations) ---------- */
.gs-runs > summary {
  padding-bottom: 10px;
  border-bottom: 1px solid var(--gs-line);
  font-size: 12px;
}
.gs-runs[open] > summary {
  margin-bottom: 6px;
}
.gs-list {
  max-height: 260px;
  overflow: auto;
  padding: 0;
  list-style: none;
}
.gs-list li + li {
  border-top: 1px solid var(--gs-line);
}
.gs-list-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: var(--gs-radius);
  background: none;
  text-align: left;
}
.gs-list-item:hover {
  background: var(--gs-hover);
}
.gs-list-item[aria-pressed='true'] {
  border-color: var(--gs-line-strong);
  background: color-mix(in srgb, var(--gs-accent) 10%, transparent);
}
.gs-list-top {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
  min-width: 0;
}
.gs-list-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.gs-list-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: var(--gs-muted);
  font-size: 12px;
}
.gs-status {
  flex-shrink: 0;
  white-space: nowrap;
  color: var(--gs-muted);
  font-size: 11px;
}
.gs-status:is([data-status='running'], [data-status='prepared']) {
  color: var(--gs-accent-text);
}
.gs-status[data-status='awaiting_answers'] {
  color: var(--gs-warning-text);
}
.gs-status:is([data-status='error'], [data-status='failed']) {
  color: var(--gs-danger);
}
.gs-status[data-status='completed'] {
  color: var(--gs-success);
}

/* ---------- Run detail ---------- */
.gs-detail {
  display: flex;
  flex-direction: column;
}
.gs-detail-title {
  margin-bottom: 18px;
}
.gs-detail-title h3 {
  font-size: 14px;
  font-weight: 500;
  overflow-wrap: anywhere;
}
.gs-detail-title p {
  margin-top: 2px;
  font-size: 12px;
}
.gs-progress-heading {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 16px;
}
.gs-progress-heading h3 {
  font-size: 22px;
  font-weight: 600;
  line-height: 1.25;
  letter-spacing: -0.02em;
}
.gs-progress-heading h3[data-status='error'] {
  color: var(--gs-danger);
}
.gs-progress-heading span {
  font-size: 12px;
  white-space: nowrap;
}
.gs-progress {
  display: block;
  width: 100%;
  height: 6px;
  margin: 14px 0 8px;
  border: 0;
  border-radius: 3px;
  overflow: hidden;
  appearance: none;
  background: var(--gs-line);
}
.gs-progress::-webkit-progress-bar {
  background: var(--gs-line);
}
.gs-progress::-webkit-progress-value {
  background: var(--gs-accent);
}
.gs-progress::-moz-progress-bar {
  background: var(--gs-accent);
}
.gs-progress-meta {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  gap: 4px 12px;
  font-size: 12px;
}
.gs-scan-actions {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
  margin: 12px 0 16px;
  font-size: 12px;
}
.gs-detail > .gs-alert,
.gs-detail > .gs-note {
  margin: 0 0 16px;
}
.gs-lede {
  margin-bottom: 20px;
  max-width: 64ch;
}
.gs-detail > .gs-empty {
  margin-bottom: 16px;
}

/* ---------- Findings ---------- */
.gs-findings {
  margin: 8px 0 20px;
}
.gs-findings .gs-section-heading h3 {
  font-size: 16px;
}
.gs-finding {
  border-top: 1px solid var(--gs-line);
}
.gs-finding:last-child {
  border-bottom: 1px solid var(--gs-line);
}
.gs-finding > summary {
  gap: 10px;
  padding: 10px 0;
  font-weight: 500;
}
.gs-finding-body {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-bottom: 16px;
}
.gs-finding-body h4 {
  margin-top: 4px;
  font-size: 12px;
  font-weight: 600;
}
.gs-severity {
  flex-shrink: 0;
  min-width: 56px;
  color: var(--gs-muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}
.gs-severity:is([data-severity='critical'], [data-severity='high']) {
  color: var(--gs-danger);
}
.gs-severity[data-severity='medium'] {
  color: var(--gs-warning-text);
}
.gs-runs > summary > .gs-muted {
  margin-left: auto;
}
.gs-finding-validation {
  padding-top: 4px;
}
.gs-finding-validation .gs-actions {
  margin-top: 0;
}
.gs-finding-validation .gs-operation + .gs-actions {
  margin-top: 10px;
}

/* ---------- Coverage, activity, details ---------- */
.gs-outcome > p {
  margin-bottom: 12px;
  font-size: 12px;
}
.gs-coverage > p,
.gs-coverage > .gs-facts {
  margin-bottom: 10px;
}
.gs-activity > p {
  margin-bottom: 8px;
  font-size: 12px;
}
.gs-workers {
  padding: 0;
  list-style: none;
}
.gs-workers li {
  display: grid;
  grid-template-columns: 84px minmax(0, 1fr) auto;
  align-items: baseline;
  gap: 12px;
  padding: 7px 0;
  border-bottom: 1px solid var(--gs-line);
  font-size: 12px;
}
.gs-worker-name {
  color: var(--gs-muted);
}
.gs-worker-label {
  overflow-wrap: anywhere;
}
.gs-timeline {
  max-height: 240px;
  overflow: auto;
  padding: 0;
  list-style: none;
}
.gs-timeline li {
  display: flex;
  align-items: baseline;
  gap: 12px;
  padding: 4px 0;
  font-size: 12px;
  overflow-wrap: anywhere;
}
.gs-timeline time {
  flex-shrink: 0;
  color: var(--gs-muted);
  font-variant-numeric: tabular-nums;
}
.gs-info .gs-facts {
  font-size: 12px;
}

/* ---------- Policy and validation ---------- */
.gs-operations {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.gs-operations > .gs-section-heading {
  margin-bottom: 0;
}
.gs-operations > .gs-detail h3 {
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 500;
}
.gs-operation {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gs-operation-compact {
  padding: 12px;
  border: 1px solid var(--gs-line);
  border-radius: var(--gs-radius);
  background: var(--gs-surface);
}
.gs-operation-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 12px;
}
.gs-operation .gs-approval {
  margin-top: 0;
  padding-top: 0;
  border-top: 0;
}
.gs-operation .gs-actions {
  margin-top: 4px;
}
.gs-questions {
  padding: 12px 14px;
  border: 1px solid color-mix(in srgb, var(--gs-warning) 45%, transparent);
  border-radius: var(--gs-radius);
  background: color-mix(in srgb, var(--gs-warning) 8%, transparent);
}
.gs-questions h4 {
  margin-bottom: 8px;
  font-size: 13px;
  font-weight: 600;
}
.gs-questions ol {
  margin-bottom: 12px;
  padding-left: 20px;
}
.gs-questions li + li {
  margin-top: 4px;
}
.gs-result {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.gs-disposition {
  font-weight: 600;
}
.gs-disposition[data-disposition='reportable'] {
  color: var(--gs-danger);
}
.gs-disposition:is([data-disposition='suppressed'], [data-disposition='not_applicable']) {
  color: var(--gs-success);
}
.gs-disposition[data-disposition='deferred'] {
  color: var(--gs-warning-text);
}

/* ---------- Narrow panels ---------- */
@container (max-width: 440px) {
  .gs-body {
    gap: 16px;
    padding: 16px 16px 24px;
  }
  .gs-progress-heading h3 {
    font-size: 19px;
  }
  .gs-banner {
    flex-direction: column;
    align-items: flex-start;
  }
  .gs-workers li {
    grid-template-columns: minmax(0, 1fr) auto;
    row-gap: 0;
  }
  .gs-worker-name {
    grid-column: 1 / -1;
  }
  .gs-tabs {
    gap: 16px;
  }
}

/* Sign-in */
.gs-signin {
  margin-top: 12px;
  padding-top: 12px;
  border-top: 1px solid var(--gs-line);
}
.gs-signin p {
  margin: 0 0 8px;
  overflow-wrap: anywhere;
}
.gs-signin a {
  color: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
.gs-code {
  font-family: var(--gs-mono, ui-monospace, monospace);
  letter-spacing: 0.08em;
}

/* ---------- Finding status and diffs ---------- */
.gs-finding-title {
  flex: 1;
  min-width: 0;
}
.gs-finding-status {
  flex-shrink: 0;
  padding: 1px 8px;
  border: 1px solid var(--gs-line-strong);
  border-radius: 999px;
  color: var(--gs-muted);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.gs-finding-status[data-tone='good'] {
  border-color: color-mix(in srgb, var(--gs-success) 50%, transparent);
  color: var(--gs-success);
}
.gs-finding-status[data-tone='warn'] {
  border-color: color-mix(in srgb, var(--gs-warning) 50%, transparent);
  color: var(--gs-warning-text);
}
.gs-diff {
  display: block;
}
.gs-diff-line {
  display: block;
  min-height: 1.5em;
}
.gs-diff-line[data-kind='add'] {
  background: color-mix(in srgb, var(--gs-success) 16%, transparent);
}
.gs-diff-line[data-kind='del'] {
  background: color-mix(in srgb, var(--gs-danger) 16%, transparent);
}
.gs-diff-line:is([data-kind='hunk'], [data-kind='meta']) {
  color: var(--gs-muted);
}
`;
