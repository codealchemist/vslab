// Share API backed by Netlify Blobs.
//   POST /api/share       body: share (see src/lib/shareSchema.js)  ->  201 { id, expiresAt }
//   GET  /api/share/:id   ->  200 share | 404 not found | 410 expired
// Blobs are keyed "YYYY-MM-DD/HH/<guid>" (UTC creation hour); cleanup-shares.mjs removes them once older than SHARE_TTL_MS.
import { getStore } from '@netlify/blobs';
import {
  MAX_SHARE_BYTES,
  SHARE_STORE,
  SHARE_TTL_HOURS,
  SHARE_TTL_MS,
  hourPrefix,
  isShareId,
  sanitizeShare,
  shareKey,
} from '../../src/lib/shareSchema.js';

const HOUR = 60 * 60 * 1000;

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// Strong consistency so a friend can open the link right after it is created.
const store = () => getStore({ name: SHARE_STORE, consistency: 'strong' });

async function create(req) {
  const text = await req.text();
  if (text.length > MAX_SHARE_BYTES) return json({ error: 'too_large' }, 413);
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return json({ error: 'invalid_json' }, 400);
  }
  const share = sanitizeShare(body);
  if (!share) return json({ error: 'invalid_payload' }, 400);

  const id = crypto.randomUUID();
  const now = new Date();
  await store().setJSON(shareKey(id, now), share, { metadata: { createdAt: now.toISOString() } });
  return json({ id, expiresAt: new Date(now.getTime() + SHARE_TTL_MS).toISOString() }, 201);
}

async function read(id) {
  if (!isShareId(id)) return json({ error: 'not_found' }, 404);
  const now = Date.now();
  // A live share sits in one of the last SHARE_TTL_HOURS + 1 hour buckets. Check newest first:
  // links are usually opened soon after being created, so this tends to stop after one or two reads.
  for (let h = 0; h <= SHARE_TTL_HOURS; h++) {
    const t = now - h * HOUR;
    const hit = await store().getWithMetadata(`${hourPrefix(new Date(t))}/${id}`, { type: 'json' });
    if (!hit) continue;
    const created = Date.parse(hit.metadata?.createdAt);
    if (!Number.isFinite(created) || now - created > SHARE_TTL_MS) return json({ error: 'expired' }, 410);
    return json(hit.data);
  }
  return json({ error: 'not_found' }, 404);
}

export default async (req, context) => {
  try {
    if (req.method === 'POST' && !context.params?.id) return await create(req);
    if (req.method === 'GET' && context.params?.id) return await read(context.params.id);
    return json({ error: 'method_not_allowed' }, 405);
  } catch (err) {
    console.error('share function failed', err);
    return json({ error: 'server_error' }, 500);
  }
};

export const config = { path: ['/api/share', '/api/share/:id'] };
