import { createApp } from './app.js';
import { AuthService } from './auth.service.js';

const app = await createApp();
const auth = app.get(AuthService);
await auth.cleanup();
const timer = setInterval(() => { auth.cleanup().catch(() => console.error('Expired authentication record cleanup failed')); }, 60_000);
timer.unref();
await app.listen(3000, '0.0.0.0');
