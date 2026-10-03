// Hourly scheduled job: deletes shared results older than SHARE_TTL_MS (24 hours)
// so the Blobs store stays small on the free plan.
import { getStore } from '@netlify/blobs';
import { SHARE_STORE, SHARE_TTL_MS, keyHourStart } from '../../src/lib/shareSchema.js';

const HOUR = 60 * 60 * 1000;

export async function cleanup(store, now = Date.now()) {
  const cutoff = now - SHARE_TTL_MS;
  const { blobs } = await store.list();
  let deleted = 0;
  let kept = 0;
  for (const { key } of blobs) {
    const start = keyHourStart(key);
    // Whole bucket older than the cutoff (or a key outside the naming scheme): delete without reading.
    let expired = start == null || start + HOUR <= cutoff;
    // Bucket straddling the cutoff: decide per blob from its creation time.
    if (!expired && start <= cutoff) {
      const meta = await store.getMetadata(key);
      const created = Date.parse(meta?.metadata?.createdAt);
      expired = !Number.isFinite(created) || created <= cutoff;
    }
    if (expired) {
      await store.delete(key);
      deleted++;
    } else {
      kept++;
    }
  }
  return { deleted, kept };
}

export default async () => {
  const result = await cleanup(getStore({ name: SHARE_STORE, consistency: 'strong' }));
  console.log(`cleanup-shares: deleted ${result.deleted}, kept ${result.kept}`);
};

export const config = { schedule: '@hourly' };
