import { Database } from './database.js';
import { audit } from './audit.js';

// Offline administrative containment. This command never weakens policy or unlocks an account.
const args = process.argv.slice(2);
if (args.length !== 2 || args[0] !== '--username' || !/^[a-z0-9][a-z0-9._-]{2,63}$/.test(args[1])) {
  throw new Error('Usage: pnpm block-user --username ACCOUNT_NAME');
}
const db = new Database();
try {
  const username = args[1];
  await db.$transaction(async tx => {
    const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "username" = ${username} FOR UPDATE`;
    if (rows.length !== 1) throw new Error('Account not found');
    const userId = rows[0].id;
    await tx.user.update({ where: { id: userId }, data: { disabled: true, securityVersion: { increment: 1 } } });
    await tx.session.deleteMany({ where: { userId } });
    await tx.pending.deleteMany({ where: { userId } });
    await tx.reauthGrant.deleteMany({ where: { userId } });
    await tx.authTransaction.updateMany({ where: { userId, state: { notIn: ['CONSUMED', 'CANCELLED', 'REJECTED', 'EXPIRED'] } }, data: { state: 'CANCELLED', version: { increment: 1 } } });
    await tx.pairingRequest.updateMany({ where: { userId, status: { in: ['PENDING', 'CANDIDATE', 'AWAITING_PC_CONFIRMATION'] } }, data: { status: 'CANCELLED' } });
    await audit(tx, userId, 'account.blocked', { source: 'administrative_cli' });
  });
  console.log('Account blocked; sessions and pending operations revoked. Authentication policy preserved.');
} finally {
  await db.$disconnect();
}
