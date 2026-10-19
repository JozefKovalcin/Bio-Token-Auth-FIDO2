import { useEffect, useRef, useState } from 'react';
import type { PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { HttpError, readableError, request, type Mode, type UserSession } from './auth-api';

type State = { step: 'password' } | { step: 'key'; options?: PublicKeyCredentialRequestOptionsJSON } |
  { step: 'mobile'; qr: string; expiresAt: string; transactionId: string } | { step: 'expired' };

export function AdvancedLogin({ mode, onLogin, activation = false, onActivation }: {
  mode: Exclude<Mode, 'A'>; onLogin: (user: UserSession) => void;
  activation?: boolean; onActivation?: (proof: string) => void;
}) {
  const [state, setState] = useState<State>({ step: mode === 'B' ? 'password' : 'key' });
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [seconds, setSeconds] = useState(0);
  const mounted = useRef(true);
  const operation = useRef(0);
  const mobileRequest = useRef<AbortController | null>(null);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false; operation.current++;
      void import('@simplewebauthn/browser').then(({ WebAuthnAbortService }) => WebAuthnAbortService.cancelCeremony());
      // A new login cancels the old pending transaction server-side. A late cancel response
      // during unmount could otherwise clear the next transaction's cookie.
    };
  }, []);

  useEffect(() => {
    if (state.step !== 'mobile') return;
    const abort = new AbortController();
    mobileRequest.current = abort;
    let timer: ReturnType<typeof setTimeout>;
    let failures = 0;
    const poll = async () => {
      const remaining = Math.max(0, Math.ceil((Date.parse(state.expiresAt) - Date.now()) / 1000));
      setSeconds(remaining);
      if (!remaining) { setState({ step: 'expired' }); return; }
      try {
        const status = await request<{ state: string }>(`auth/c/status?transactionId=${encodeURIComponent(state.transactionId)}`, undefined, abort.signal);
        if (abort.signal.aborted) return;
        failures = 0;
        if (status.state === 'APPROVED') {
          const result = await request<UserSession | { activationProofId: string }>('auth/c/complete', { transactionId: state.transactionId }, abort.signal);
          if (!abort.signal.aborted) {
            if ('activationProofId' in result) onActivation?.(result.activationProofId);
            else onLogin(result);
          }
          return;
        }
        if (['REJECTED', 'EXPIRED', 'CANCELLED', 'CONSUMED'].includes(status.state)) {
          setError('Požiadavka bola ukončená. Začnite nové prihlásenie.'); setState({ step: 'expired' }); return;
        }
      } catch (value) {
        if (abort.signal.aborted) return;
        if (value instanceof HttpError && [400, 401, 409].includes(value.status)) {
          setError('Prihlásenie už nie je platné. Začnite znova.'); setState({ step: 'expired' }); return;
        }
        failures++; setError(readableError(value));
      }
      if (!abort.signal.aborted) timer = setTimeout(poll, Math.min(10_000, 1500 * (failures + 1)));
    };
    void poll();
    return () => { abort.abort(); clearTimeout(timer); if (mobileRequest.current === abort) mobileRequest.current = null; };
  }, [state, onLogin, onActivation]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    const current = ++operation.current;
    setBusy(true); setError('');
    try { await work(); }
    catch (value) { if (mounted.current && operation.current === current) setError(readableError(value)); }
    finally { if (mounted.current && operation.current === current) setBusy(false); }
  }

  async function verifyKey() {
    const current = operation.current;
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const result = await request<{ options: PublicKeyCredentialRequestOptionsJSON }>(`auth/${mode.toLowerCase()}/options`, mode === 'C' ? { purpose: activation ? 'C_ACTIVATION' : 'LOGIN' } : {});
    if (!mounted.current || current !== operation.current) return;
    const response = await startAuthentication({ optionsJSON: result.options });
    if (!mounted.current || current !== operation.current) return;
    if (mode === 'B') {
      const user = await request<UserSession>('auth/b/verify', { response });
      if (mounted.current && current === operation.current) onLogin(user);
    } else {
      const mobile = await request<{ transactionId: string; capability: string; expiresAt: string }>('auth/c/verify', { response });
      const QRCode = await import('qrcode');
      const qr = await QRCode.toDataURL(JSON.stringify({ type: 'login', v: 1, origin: location.origin, token: mobile.capability }));
      if (mounted.current && current === operation.current) setState({ step: 'mobile', qr, expiresAt: mobile.expiresAt, transactionId: mobile.transactionId });
    }
  }

  return <div className="advanced-auth" aria-busy={busy}>
    <p className="hint">{mode === 'B' ? 'Overte heslo a potom pripojte svoj YubiKey.' : 'Pripojte YubiKey, overte jeho PIN a následne schváľte prihlásenie spárovaným telefónom.'}</p>
    {state.step === 'password' ? <form onSubmit={event => { event.preventDefault(); void run(async () => {
      await request('auth/b/password', { username, password }); setPassword('');
      if (mounted.current) setState({ step: 'key' });
    }); }}>
      <label htmlFor="b-username">Používateľské meno</label><input id="b-username" autoComplete="username" required minLength={3} maxLength={64} value={username} onChange={event => setUsername(event.target.value.toLowerCase())} disabled={busy}/>
      <label htmlFor="b-password">Heslo</label><input id="b-password" type="password" autoComplete="current-password" required maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
      <button disabled={busy}>Overiť heslo</button>
    </form> : null}
    {state.step === 'key' ? <button disabled={busy} onClick={() => void run(verifyKey)}>{busy ? 'Overujem…' : 'Overiť YubiKey'}</button> : null}
    {state.step === 'mobile' ? <div className="enrollment"><img src={state.qr} width={220} height={220} alt="Jednorazová požiadavka na schválenie prihlásenia telefónom"/><p role="status">Naskenujte QR spárovanou aplikáciou. Zostáva {seconds} s.</p><button className="text-button" disabled={busy} onClick={() => void run(async () => {
      mobileRequest.current?.abort();
      try { await request('auth/c/cancel', { transactionId: state.transactionId }); }
      finally { if (mounted.current) setState({ step: 'expired' }); }
    })}>Zrušiť prihlásenie</button></div> : null}
    {state.step === 'expired' ? <button onClick={() => { setError(''); setState({ step: mode === 'B' ? 'password' : 'key' }); }}>Začať znova</button> : null}
    {error ? <p className="error" role="alert">{error}</p> : null}
  </div>;
}
