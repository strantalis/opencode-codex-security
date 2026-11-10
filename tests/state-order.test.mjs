import test from 'node:test';
import assert from 'node:assert/strict';
import { SnapshotOrder } from '../src/state-order.ts';

test('new server epoch recovers low revisions and rejects late old replies', () => {
  const order = new SnapshotOrder();
  assert.equal(order.accept({ instanceId: 'a', revision: 20 }, true), true);
  assert.equal(order.accept({ instanceId: 'a', revision: 18 }, true), false);
  assert.equal(order.accept({ instanceId: 'b', revision: 0 }, false), false);
  assert.equal(order.accept({ instanceId: 'b', revision: 0 }, true), true);
  assert.equal(order.accept({ instanceId: 'a', revision: 21 }, true), false);
  assert.equal(order.accept({ instanceId: 'a', revision: 22 }, false), false);
  assert.equal(order.accept({ instanceId: 'b', revision: 1 }, false), true);
});

test('service restart changes instance ID but reruns keep it', async () => {
  const { ScanService } = await import('../src/core/scan-service.mjs');
  const root = new URL('../fixtures/clean/', import.meta.url).pathname;
  const first = new ScanService(root);
  const second = new ScanService(root);
  assert.notEqual(first.getState().instanceId, second.getState().instanceId);
  const id = first.getState().instanceId;
  first.start();
  await first.wait();
  first.start();
  await first.wait();
  assert.equal(first.getState().instanceId, id);
  await first.dispose();
  await second.dispose();
});
