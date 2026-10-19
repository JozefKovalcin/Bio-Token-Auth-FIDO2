import type { Tx } from './session-policy.service.js';

const allowed = new Set(['mode', 'profile', 'credentialId', 'deviceId', 'result', 'allowedModes', 'source']);
/** Only server-produced, bounded classifications and internal IDs. Never pass request bodies. */
export async function audit(tx: Tx, userId: string | null, event: string, details: Record<string, string | number | boolean> = {}) {
  if (!/^[a-z][a-z0-9_.]{1,63}$/.test(event) || Object.entries(details).some(([key, value]) =>
    !allowed.has(key) || (typeof value === 'string' && value.length > 128))) throw new Error('Invalid audit classification');
  await tx.auditEvent.create({ data: { userId, event, details } });
}
