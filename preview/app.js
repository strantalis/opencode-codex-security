'use strict';

const $ = (id) => document.getElementById(id);
const severities = ['critical', 'high', 'medium', 'low'];
let state = { status: 'idle', findings: [], events: [], progress: { done: 0, total: 0 } };
let selectedId = null;
let severity = 'all';
let search = '';
let busy = false;
let previousAnnouncement = '';
let streamConnected = false;
let lastRenderKey = '';

function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = String(text);
  return node;
}
function readable(value) {
  if (value == null) return '';
  return typeof value === 'string' ? value : JSON.stringify(value, null, 2);
}
function badge(value) {
  const node = element('span', 'severity-badge', value || 'Unknown');
  node.dataset.severity = value;
  return node;
}
function setConnection(ok) {
  $('connection-dot').classList.toggle('online', ok);
  $('connection-label').textContent = ok ? 'Local connection' : 'Reconnecting';
}
function updateElapsed() {
  const started = new Date(state.startedAt).getTime();
  if (!state.startedAt || !Number.isFinite(started)) {
    $('elapsed-time').textContent = '—';
    return;
  }
  const end = state.finishedAt ? new Date(state.finishedAt).getTime() : Date.now();
  const seconds = Math.max(0, Math.floor((end - started) / 1000));
  $('elapsed-time').textContent =
    seconds < 60 ? `${seconds}s elapsed` : `${Math.floor(seconds / 60)}m ${seconds % 60}s elapsed`;
}
function renderScan() {
  const status = state.status || 'idle';
  const running = status === 'running';
  const titles = {
    idle: 'Ready when you are',
    running: 'Scanning the repository',
    completed: 'Scan complete',
    cancelled: 'Scan cancelled',
    error: 'Scan interrupted',
  };
  const descriptions = {
    idle: 'Start a scan to inspect the sample repository.',
    running: state.phase || 'Inspecting local files for potential security issues.',
    completed: 'Review the evidence and verify each pattern match.',
    cancelled: 'Partial results are shown below. Run again to start fresh.',
    error: 'Check the error below, then try another scan.',
  };
  $('scan-heading').textContent = titles[status] || status;
  $('scan-description').textContent = descriptions[status] || readable(state.phase);
  $('scan-status').textContent = status;
  $('scan-indicator').className = `scan-indicator ${status}`;
  $('scan-button').classList.toggle('cancel', running);
  $('scan-button').disabled = busy;
  $('scan-button-label').textContent = busy
    ? running
      ? 'Cancelling…'
      : 'Starting…'
    : running
      ? 'Cancel scan'
      : status === 'idle'
        ? 'Run local scan'
        : 'Run again';
  const done = Number(state.progress?.done) || 0;
  const total = Number(state.progress?.total) || 0;
  const percent =
    total > 0
      ? Math.min(100, Math.max(0, Math.round((done / total) * 100)))
      : status === 'completed'
        ? 100
        : 0;
  $('progress-fill').style.width = `${percent}%`;
  $('progress-track').setAttribute('aria-valuenow', String(percent));
  $('progress-track').setAttribute(
    'aria-valuetext',
    total ? `${done} of ${total} files scanned` : titles[status] || status,
  );
  $('progress-text').textContent = total
    ? `${done} / ${total} files · ${percent}%`
    : running
      ? 'Discovering files…'
      : 'No files scanned yet';
  if (state.repository) {
    const repository =
      typeof state.repository === 'string'
        ? state.repository
        : state.repository.name || state.repository.path;
    if (repository) {
      $('repository-name').textContent =
        repository.split(/[\\/]/).filter(Boolean).pop() || repository;
      $('repository-name').title = repository;
    }
  }
  $('scan-error').hidden = !state.error;
  $('scan-error').textContent = readable(state.error);
  updateElapsed();
  const announcement = `${status}: ${(state.findings || []).length} findings`;
  if (announcement !== previousAnnouncement) {
    $('live-announcement').textContent = announcement;
    previousAnnouncement = announcement;
  }
}
function renderFindings() {
  const findings = Array.isArray(state.findings) ? state.findings : [];
  for (const level of severities)
    $('count-' + level).textContent = findings.filter((f) => f.severity === level).length;
  document
    .querySelectorAll('.severity-card')
    .forEach((button) =>
      button.setAttribute('aria-pressed', String(button.dataset.severity === severity)),
    );
  $('severity-filter').value = severity;
  $('clear-filter').hidden = severity === 'all' && !search;
  $('finding-count').textContent = findings.length;
  const visible = findings.filter(
    (f) =>
      (severity === 'all' || f.severity === severity) &&
      `${f.title} ${f.path} ${f.cwe} ${f.summary}`.toLowerCase().includes(search),
  );
  if (!visible.some((f) => String(f.id) === selectedId))
    selectedId = visible.length ? String(visible[0].id) : null;
  const focusedId = document.activeElement?.dataset?.findingId;
  const list = $('findings-list');
  list.replaceChildren();
  for (const finding of visible) {
    const row = element(
      'button',
      `finding-row${String(finding.id) === selectedId ? ' selected' : ''}`,
    );
    row.type = 'button';
    row.dataset.findingId = String(finding.id);
    row.setAttribute('aria-pressed', String(String(finding.id) === selectedId));
    row.setAttribute('aria-controls', 'detail-content');
    row.setAttribute(
      'aria-label',
      `${finding.severity} severity: ${finding.title}, ${finding.path}${finding.line ? ` line ${finding.line}` : ''}`,
    );
    const dot = element(
      'i',
      `severity-dot ${severities.includes(finding.severity) ? finding.severity : 'low'}`,
    );
    dot.setAttribute('aria-hidden', 'true');
    const content = element('div', 'finding-row-main');
    content.append(
      element('h3', '', finding.title || 'Untitled finding'),
      element(
        'div',
        'finding-location',
        `${finding.path || 'Unknown file'}${finding.line ? `:${finding.line}` : ''}`,
      ),
    );
    row.append(dot, content, badge(finding.severity));
    row.addEventListener('click', () => {
      selectedId = String(finding.id);
      renderFindings();
    });
    list.append(row);
  }
  if (focusedId)
    Array.from(list.children)
      .find((row) => row.dataset.findingId === focusedId)
      ?.focus({ preventScroll: true });
  $('findings-empty').hidden = visible.length > 0;
  if (findings.length && !visible.length) {
    $('empty-heading').textContent = 'No matching findings';
    $('empty-description').textContent = 'Try another search or clear your severity filter.';
  } else if (state.status === 'running') {
    $('empty-heading').textContent = 'Following the scan';
    $('empty-description').textContent =
      'Findings will appear here as the local engine inspects each file.';
  } else if (state.status === 'completed') {
    $('empty-heading').textContent = 'No pattern matches found';
    $('empty-description').textContent =
      'This scan found no supported patterns. That does not mean the repository is free of vulnerabilities.';
  } else if (state.status === 'cancelled' || state.status === 'error') {
    $('empty-heading').textContent = 'The scan did not finish';
    $('empty-description').textContent =
      'No findings were returned before the scan stopped. Run it again for a fresh inspection.';
  } else {
    $('empty-heading').textContent = 'A clearer picture starts here';
    $('empty-description').textContent =
      'Run a local scan to see potential issues, the code behind them, and suggested fixes.';
  }
  $('visible-count').textContent =
    `${visible.length}${visible.length !== findings.length ? ` of ${findings.length}` : ''} finding${visible.length === 1 ? '' : 's'}`;
  renderDetail(visible.find((f) => String(f.id) === selectedId));
}
function renderDetail(finding) {
  const container = $('detail-content');
  container.replaceChildren();
  if (!finding) {
    const empty = element('div', 'detail-empty');
    const arrow = element('span', '', '↖');
    arrow.setAttribute('aria-hidden', 'true');
    empty.append(
      arrow,
      element('h3', '', 'Follow the evidence'),
      element(
        'p',
        '',
        'Select a finding to inspect its location, evidence, and recommended next step.',
      ),
    );
    container.append(empty);
    return;
  }
  const kicker = element('div', 'detail-kicker');
  kicker.append(badge(finding.severity), element('span', 'cwe', finding.cwe || 'Pattern match'));
  container.append(
    kicker,
    element('h3', 'detail-title', finding.title),
    element(
      'div',
      'detail-path',
      `${finding.path || 'Unknown file'}${finding.line ? `:${finding.line}` : ''}`,
    ),
  );
  for (const [label, value, code] of [
    ['What we found', finding.summary, false],
    ['Evidence', finding.evidence, true],
    ['Recommended next step', finding.remediation, false],
  ]) {
    if (!value) continue;
    const section = element('section', 'detail-section');
    section.append(
      element('h4', '', label),
      element(code ? 'pre' : 'p', code ? 'evidence-code' : '', readable(value)),
    );
    container.append(section);
  }
  container.append(
    element(
      'p',
      'review-note',
      'Prototype finding · Validate exploitability and context before making changes. This local pattern engine is not a complete security assessment.',
    ),
  );
}
function renderActivity() {
  const events = Array.isArray(state.events) ? state.events : [];
  $('activity-count').textContent = `${events.length} EVENT${events.length === 1 ? '' : 'S'}`;
  const list = $('activity-list');
  list.replaceChildren();
  if (!events.length) {
    list.append(
      element('li', 'activity-placeholder', 'Scan events will appear here as they happen.'),
    );
    return;
  }
  for (const event of events.slice(-30).reverse()) {
    const row = element('li', '');
    const date = new Date(event.time);
    const time = element(
      'time',
      '',
      Number.isFinite(date.getTime()) ? date.toLocaleTimeString([], { hour12: false }) : '--:--:--',
    );
    if (Number.isFinite(date.getTime())) time.dateTime = date.toISOString();
    row.append(time, element('span', '', readable(event.message)));
    list.append(row);
  }
}
function acceptState(next) {
  if (!next || typeof next !== 'object' || !next.status) return;
  const previousScanId = state.scanId;
  state = next;
  if (previousScanId !== state.scanId) selectedId = null;
  setConnection(true);
  renderScan();
  const key = JSON.stringify([state.findings, state.status, state.scanId]);
  if (key !== lastRenderKey) {
    renderFindings();
    lastRenderKey = key;
  }
  renderActivity();
}
async function fetchState() {
  try {
    const response = await fetch('/api/state', { cache: 'no-store' });
    if (!response.ok) throw new Error(`Local API returned ${response.status}`);
    acceptState(await response.json());
  } catch (_) {
    setConnection(false);
  }
}
$('scan-button').addEventListener('click', async () => {
  if (busy) return;
  const action = state.status === 'running' ? 'cancel' : 'scan';
  busy = true;
  renderScan();
  try {
    const response = await fetch(`/api/${action}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(
        readable(payload.error || payload.message) || `Request failed (${response.status}).`,
      );
    acceptState(payload.state || payload);
    await fetchState();
  } catch (error) {
    $('scan-error').textContent = error.message || 'Unable to reach the local scan service.';
    $('scan-error').hidden = false;
  } finally {
    busy = false;
    $('scan-button').disabled = false;
    $('scan-button-label').textContent =
      state.status === 'running'
        ? 'Cancel scan'
        : state.status === 'idle'
          ? 'Run local scan'
          : 'Run again';
  }
});
$('finding-search').addEventListener('input', (event) => {
  search = event.target.value.toLowerCase().trim();
  renderFindings();
});
$('severity-filter').addEventListener('change', (event) => {
  severity = event.target.value;
  renderFindings();
});
document.querySelectorAll('.severity-card').forEach((button) =>
  button.addEventListener('click', () => {
    severity = severity === button.dataset.severity ? 'all' : button.dataset.severity;
    renderFindings();
  }),
);
$('clear-filter').addEventListener('click', () => {
  severity = 'all';
  search = '';
  $('finding-search').value = '';
  renderFindings();
  $('finding-search').focus();
});
renderScan();
renderFindings();
fetchState();
if (typeof EventSource !== 'undefined') {
  const events = new EventSource('/api/events');
  events.addEventListener('state', (event) => {
    try {
      acceptState(JSON.parse(event.data));
    } catch (_) {
      /* Ignore malformed events; polling can recover. */
    }
  });
  events.onopen = () => {
    streamConnected = true;
    setConnection(true);
  };
  events.onerror = () => {
    streamConnected = false;
    setConnection(false);
  };
  window.addEventListener('pagehide', () => events.close());
}
setInterval(updateElapsed, 1000);
setInterval(() => {
  if (!document.hidden && !streamConnected) fetchState();
}, 2500);
