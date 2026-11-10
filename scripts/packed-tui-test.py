#!/usr/bin/env python3
"""Exercise an installed npm tarball through the native OpenCode terminal UI.

Uses only Python's standard library. Diagnostics are retained under .runtime.
No Node, npm, Bun, credentials, or user configuration are exposed to the host.
"""
import argparse
import errno
import fcntl
import json
import os
from pathlib import Path
import pty
import re
import select
import shutil
import signal
import struct
import subprocess
import sys
import tempfile
import termios
import time


ANSI = re.compile(r"\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)|\x1b\[[0-?]*[ -/]*[@-~]|\x1b[()][A-Z0-9]|\x1b[=>]")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--package', type=Path, required=True)
    parser.add_argument('--opencode', type=Path, default=Path(__file__).resolve().parents[1] / 'node_modules/.bin/opencode')
    parser.add_argument('--timeout', type=float, default=45)
    parser.add_argument('--real-default', action='store_true', help='Verify real default preview/cancel, without executing it')
    parser.add_argument('--keyless-config', action='store_true', help='Verify unsupported keyless setup error without fallback')
    args = parser.parse_args()
    package = args.package.resolve(strict=True)
    binary = args.opencode.resolve(strict=True)
    if not (package / 'package.json').is_file():
        parser.error('--package must be an installed package directory')
    # A JS shim would defeat the native bundled-runtime assertion.
    with binary.open('rb') as executable:
        magic = executable.read(4)
    if magic not in [b'\x7fELF', b'\xcf\xfa\xed\xfe', b'\xfe\xed\xfa\xcf', b'\xca\xfe\xba\xbe']:
        parser.error('--opencode must resolve to a native executable; run npm run setup:local or pass --opencode')
    runtime = Path(__file__).resolve().parents[1] / '.runtime'
    runtime.mkdir(exist_ok=True)
    isolated = Path(tempfile.mkdtemp(prefix='packed-tui-', dir=runtime))
    for folder in ['home', 'data', 'config/opencode', 'state', 'cache', 'project', 'bin']:
        (isolated / folder).mkdir(parents=True, exist_ok=True)
    # Deliberately empty PATH: even system Node/Bun cannot mask packaging defects.
    env = {
        'PATH': str(isolated / 'bin'),
        'HOME': str(isolated / 'home'),
        'XDG_DATA_HOME': str(isolated / 'data'),
        'XDG_CONFIG_HOME': str(isolated / 'config'),
        'XDG_STATE_HOME': str(isolated / 'state'),
        'XDG_CACHE_HOME': str(isolated / 'cache'),
        'OPENCODE_CONFIG': str(isolated / 'config/opencode/opencode.json'),
        'CODEX_HOME': str(isolated / 'home/.codex'),
        'OPENCODE_DISABLE_AUTOUPDATE': '1',
        'OPENCODE_DISABLE_MODELS_FETCH': '1',
        'TERM': 'xterm-256color',
        'LANG': 'C.UTF-8',
    }
    assert all(shutil.which(name, path=env['PATH']) is None for name in ['node', 'npm', 'bun'])
    Path(env['OPENCODE_CONFIG']).write_text(json.dumps({
        'plugins': [{'package': str(package)} if args.real_default or args.keyless_config
                    else {'package': str(package), 'options': {'engine': 'fixture'}}],
    }))
    if args.keyless_config:
        codex = Path(env['CODEX_HOME'])
        codex.mkdir()
        (codex / 'config.toml').write_text('model_provider = "network"\n[model_providers.network]\nbase_url = "https://gateway.example.test/v1"\nrequires_openai_auth = false\n')
    master, slave = pty.openpty()
    fcntl.ioctl(slave, termios.TIOCSWINSZ, struct.pack('HHHH', 50, 180, 0, 0))
    child = subprocess.Popen([str(binary), '--standalone'], cwd=isolated / 'project',
                             env=env, stdin=slave, stdout=slave, stderr=slave,
                             start_new_session=True)
    os.close(slave)
    output = bytearray()
    transcript = isolated / 'terminal.ansi'
    print(f'Native packed-TUI diagnostics: {isolated}', flush=True)

    def plain():
        return ANSI.sub('', output.decode('utf-8', errors='replace'))

    def pump(duration=0.1):
        if not select.select([master], [], [], duration)[0]:
            return
        try:
            data = os.read(master, 65536)
        except OSError as exc:
            if exc.errno == errno.EIO:
                return
            raise
        output.extend(data)
        transcript.write_bytes(output)
        # Answer terminal capability probes without injecting model prompts.
        for query, reply in [(b'\x1b[6n', b'\x1b[1;1R'),
                             (b'\x1b[c', b'\x1b[?1;2c'),
                             (b'\x1b]11;?\x07', b'\x1b]11;rgb:0000/0000/0000\x07')]:
            if query in data:
                os.write(master, reply)

    def wait_for(predicate, description, timeout=None):
        deadline = time.monotonic() + (timeout or args.timeout)
        while time.monotonic() < deadline:
            pump()
            text = plain()
            if re.search(r'Plugin failed|(?:Failed to load|Error loading|failed to import).*?(?:plugin|tui)|JSX is not supported|Cannot find module|ModuleNotFound', text, re.I):
                raise RuntimeError('Native host reported a plugin/module load failure')
            if predicate(text):
                return
            if child.poll() is not None:
                raise RuntimeError(f'Native host exited early: {child.returncode}')
        raise RuntimeError(f'Timed out waiting for {description}')

    def send(data):
        os.write(master, data)

    try:
        wait_for(lambda text: any(label in text for label in ['Ask anything', 'Ask a question', 'ctrl+p', 'Ctrl+P']), 'native home screen')
        # Let plugin registration settle before opening the slash completion menu.
        end = time.monotonic() + 2
        while time.monotonic() < end:
            pump()
        send(b'/security')
        wait_for(lambda text: 'Security: open scans' in text, 'registered /security command')
        send(b'\r')
        wait_for(lambda text: 'History workspace:' in text and 'Reviewcode,thenfolloweachscanhere.' in re.sub(r'\s+', '', text),
                 'rendered Security route')
        # Return to the home prompt, then invoke only the fixture slash command.
        send(b'\x1b')
        end = time.monotonic() + 0.5
        while time.monotonic() < end:
            pump()
        send(b'/security-scan')
        wait_for(lambda text: 'Security: new scan' in text, 'registered fixture scan command')
        send(b'\r')
        if args.keyless_config:
            wait_for(lambda text: 'Keylessnetworkidentity' in re.sub(r'\s+', '', text),
                     'explicit keyless SDK setup blocker')
            assert '4findingsshown' not in re.sub(r'\s+', '', plain()), 'Unexpected fixture fallback'
            assert not list((isolated / 'home').rglob('auth.json')), 'Unexpected credential file'
        elif args.real_default:
            wait_for(lambda text: 'Reviewthisscan' in re.sub(r'\s+', '', text)
                     and 'Wholerepository' in re.sub(r'\s+', '', text),
                     'real SDK repository/scope review')
            assert str(isolated / 'project') in plain(), 'Review lost actual workspace target'
            assert '4findingsshown' not in re.sub(r'\s+', '', plain()), 'Unexpected fixture fallback'
            send(b'\x1b')  # Cancel the preview. Never send Ctrl+Y.
            end = time.monotonic() + 1
            while time.monotonic() < end:
                pump()
            assert not list((isolated / 'home').rglob('auth.json')), 'Unexpected credential file'
        else:
            wait_for(lambda text: '4findingsshown' in re.sub(r'\s+', '', text), 'four rendered fixture findings')
        # Native exit binding, rather than a forced kill, is part of the smoke test.
        send(b'\x03')
        end = time.monotonic() + 0.4
        while time.monotonic() < end:
            pump()
        if child.poll() is None:
            send(b'\x03')
        deadline = time.monotonic() + 10
        while child.poll() is None and time.monotonic() < deadline:
            pump()
        if child.poll() is None:
            raise RuntimeError('Native TUI did not exit after Ctrl+C')
        if child.returncode != 0:
            raise RuntimeError(f'Native TUI exited with status {child.returncode}')
        result = ('keyless setup error without fixture fallback' if args.keyless_config else
                  'real default repository/scope preview, cancelled without scan' if args.real_default else
                  '4 explicit fixture findings')
        print(f'PACKED NATIVE TUI PASSED: /security rendered, {result}, clean exit; no Node/npm/Bun on PATH.')
    finally:
        if child.poll() is None:
            os.killpg(child.pid, signal.SIGTERM)
            try:
                child.wait(timeout=3)
            except subprocess.TimeoutExpired:
                os.killpg(child.pid, signal.SIGKILL)
                child.wait()
        transcript.write_bytes(output)
        (isolated / 'terminal.txt').write_text(plain())
        os.close(master)


if __name__ == '__main__':
    try:
        main()
    except (RuntimeError, OSError) as error:
        print(f'PACKED NATIVE TUI FAILED: {error}', file=sys.stderr)
        sys.exit(1)
