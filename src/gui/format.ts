/** Small display helpers shared by the Desktop panel components. */
export const shortTime = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';

export const clockTime = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });

export function statusLabel(status: string) {
  const labels: Record<string, string> = {
    idle: 'Ready',
    prepared: 'Ready to start',
    running: 'Running',
    awaiting_answers: 'Needs your answer',
    completed: 'Done',
    cancelled: 'Cancelled',
    error: 'Failed',
  };
  return labels[status] ?? status;
}

/** SDK validation dispositions: reportable, suppressed, not_applicable, deferred. */
export function dispositionLabel(disposition: string) {
  const labels: Record<string, string> = {
    reportable: 'Confirmed in source',
    suppressed: 'Not confirmed',
    not_applicable: 'Not applicable',
    deferred: 'Undecided: needs more context',
  };
  return labels[disposition] ?? disposition.replaceAll('_', ' ');
}
