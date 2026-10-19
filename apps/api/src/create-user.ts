import 'reflect-metadata';
import { AuthService } from './auth.service.js';
import { Database } from './database.js';
import { SessionPolicyService } from './session-policy.service.js';

// Administrative stdin only: passwords never become command arguments or log fields.
const db = new Database();
try {
  let input = '';
  for await (const chunk of process.stdin) {
    input += chunk;
    if (input.length > 2048) throw new Error('Input too long');
  }
  const { username, password } = JSON.parse(input);
  if (typeof username !== 'string' || typeof password !== 'string') throw new Error('Invalid input');
  const user = await new AuthService(db, new SessionPolicyService(db)).createUser(username, password);
  console.log(`Účet ${user.username} je vytvorený. TOTP možno zapnúť po prihlásení.`);
} catch {
  console.error('Účet sa nepodarilo vytvoriť. Overte jedinečné meno (3–64 znakov), heslo (8–128 znakov) a databázu.');
  process.exitCode = 1;
} finally { await db.$disconnect(); }
