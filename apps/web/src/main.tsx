import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Vault } from 'lucide-react';
import './style.css';

type User = { username: string; mode: string; totpActive: boolean; expiresAt: string };
type Enrollment = { secret: string; qr: string };
type View = 'loading' | 'login' | 'register' | 'totp' | 'dashboard' | 'setup';
class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }
async function api<T>(path: string, data?: object): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`/api/auth/${path}`, { credentials: 'same-origin',
      ...(data ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) } : {}) });
  } catch { throw new Error('Server nie je dostupný. Skontrolujte pripojenie a skúste znova.'); }
  let result;
  try { result = await response.json(); }
  catch { throw new Error('Server nevrátil platnú odpoveď. Skúste to o chvíľu znova.'); }
  if (!response.ok) throw new ApiError(typeof result.message === 'string' ? result.message : 'Požiadavka sa nepodarila.', response.status);
  return result;
}

function App() {
  const [view, setView] = useState<View>('loading');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const initialViewResolved = useRef(false);

  useEffect(() => {
    let alive = true;
    api<User>('me').then(value => {
      if (alive) { setUser(value); setExpiresAt(Date.parse(value.expiresAt)); setView('dashboard'); }
    }).catch(e => {
      if (alive) { if (!(e instanceof ApiError && e.status === 401)) setError(e.message); setView('login'); }
    });
    return () => { alive = false; };
  }, []);
  useEffect(() => {
    if (view === 'loading') return;
    if (!initialViewResolved.current) { initialViewResolved.current = true; return; }
    title.current?.focus();
  }, [view]);
  useEffect(() => {
    if (!['totp', 'setup', 'dashboard'].includes(view)) return;
    const tick = () => {
      const seconds = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
      setRemaining(seconds);
      if (seconds === 0) {
        setEnrollment(null); setCode(''); setUser(null); setView('login');
        setError('Platnosť relácie vypršala. Prihláste sa znova.');
      }
    };
    tick(); const timer = setInterval(tick, 1000); return () => clearInterval(timer);
  }, [view, expiresAt]);

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (view === 'register') {
        const value = await api<User>('register', { username, password });
        setPassword(''); setUser(value); setExpiresAt(Date.parse(value.expiresAt)); setView('dashboard');
      } else if (view === 'login') {
        const result = await api<{ step: 'totp' | 'done'; expiresAt?: string; user?: User }>('password', { username, password });
        setPassword('');
        if (result.step === 'totp') { setExpiresAt(Date.parse(result.expiresAt!)); setView('totp'); }
        else { setUser(result.user!); setExpiresAt(Date.parse(result.user!.expiresAt)); setView('dashboard'); }
      } else if (view === 'totp') {
        const value = await api<User>('totp', { code });
        setCode(''); setUser(value); setExpiresAt(Date.parse(value.expiresAt)); setView('dashboard');
      }
    } catch (e) { setError(e instanceof Error ? e.message : 'Požiadavka sa nepodarila. Skúste znova.'); }
    finally { setBusy(false); }
  }

  async function startSetup() {
    setBusy(true); setError('');
    try { setEnrollment(await api<Enrollment>('enrollment')); setCode(''); setView('setup'); }
    catch (e) { setError(e instanceof Error ? e.message : 'QR kód sa nepodarilo vytvoriť. Skúste znova.'); }
    finally { setBusy(false); }
  }

  async function activateTotp(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      await api('totp/activate', { code });
      setCode(''); setEnrollment(null); setUser(current => current ? { ...current, totpActive: true } : current); setView('dashboard');
    } catch (e) { setError(e instanceof Error ? e.message : 'Kód sa nepodarilo overiť. Skúste znova.'); }
    finally { setBusy(false); }
  }

  async function logout() {
    setBusy(true); setError('');
    try {
      await api('logout', {}); setUser(null); setEnrollment(null); setCode(''); setPassword(''); setView('login');
    } catch (e) { setError(e instanceof Error ? e.message : 'Odhlásenie sa nepodarilo. Skúste znova.'); }
    finally { setBusy(false); }
  }

  const second = view === 'totp' || view === 'setup';
  const heading = view === 'register' ? 'Vytvorte si účet.' : view === 'totp' ? 'Potvrďte, že ste to vy.' : view === 'setup' ? 'Dodatočná vrstva zabezpečenia.' : view === 'dashboard' ? `Vitajte, ${user?.username}.` : 'Vitajte späť.';
  const firstCurrent = !second && view !== 'dashboard';
  const firstComplete = second || view === 'dashboard';
  const secondCurrent = second;
  const secondComplete = view === 'dashboard' && Boolean(user?.totpActive);
  return <div className="shell">
    <aside className="visual">
      <a className="brand" href="/" aria-label="Bio Token Auth – domov"><span className="brand-mark" aria-hidden="true"><Vault size={44} strokeWidth={1.5}/></span><span className="brand-type">BIO TOKEN<small>AUTH</small></span></a>
      <div className="visual-copy">
        <p className="eyebrow">OVERENIE IDENTITY / REŽIM A</p>
        <h1><span>Dva kroky.</span><span>Jedno bezpečné</span><span>prihlásenie.</span></h1>
      </div>
      <div className="photo-footer" aria-label="Dva faktory overenia"><div><span>01</span><p>Heslo</p></div><div><span>02</span><p>Autentifikačná aplikácia</p></div></div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="mode-tag">REŽIM A <span aria-hidden="true">/</span> HESLO + TOTP</span></header>
      <main className="main">
        <div className="form-wrap">
          <ol className="progress" aria-label="Priebeh overenia">
            <li id="factor-one" className={firstCurrent ? 'current' : firstComplete ? 'complete' : ''} aria-current={firstCurrent ? 'step' : undefined}><span className="step-number">01</span><span>Heslo</span></li>
            <li id="factor-two" className={secondCurrent ? 'current' : secondComplete ? 'complete' : ''} aria-current={secondCurrent ? 'step' : undefined}><span className="step-number">02</span><span>Autentifikátor</span></li>
          </ol>
          <section className="panel" aria-busy={busy}>
        <p className="eyebrow">{view === 'dashboard' ? 'VÁŠ ÚČET' : view === 'totp' || view === 'setup' ? 'DRUHÝ KROK' : view === 'register' ? 'REGISTRÁCIA' : 'REŽIM A  /  HESLO + TOTP'}</p>
        <h2 ref={title} tabIndex={-1}>{view === 'loading' ? 'Načítavam účet…' : heading}</h2>
        <p className="hint">{view === 'register' ? 'Zvoľte si meno a dlhé heslo. Autentifikátor môžete pridať teraz alebo neskôr v účte.' : view === 'totp' ? 'Otvorte 2FAS, Google Authenticator alebo inú TOTP aplikáciu a zadajte aktuálny šesťmiestny kód.' : view === 'setup' ? 'Naskenujte QR kód v autentifikačnej aplikácii a potvrďte prvý kód.' : view === 'dashboard' ? 'Vyberte si, ako chcete chrániť svoj účet.' : 'Zadajte svoje meno a heslo.'}</p>

        {view === 'loading' ? <p role="status">Overujem prihlásenie…</p> : null}
        {view === 'login' || view === 'register' || view === 'totp' ? <form onSubmit={submit}>
          {view !== 'totp' ? <>
            <label htmlFor="username">Používateľské meno</label>
            <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={64} pattern="[a-z0-9][a-z0-9._\-]{2,63}" placeholder="napr. student" disabled={busy}/>
            <label htmlFor="password">Heslo {view === 'register' ? <span className="label-note">· aspoň 12 znakov</span> : null}</label>
            <input id="password" name="password" type="password" autoComplete={view === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={view === 'register' ? 12 : 1} maxLength={128} disabled={busy}/>
          </> : <>
            <label htmlFor="code">Kód z autentifikátora</label>
            <input className="otp" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="000000" disabled={busy}/>
            {view === 'totp' ? <p className="expiry">Na overenie zostáva {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.</p> : null}
          </>}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy}>{busy ? 'Spracúvam…' : view === 'register' ? 'Vytvoriť účet' : view === 'totp' ? 'Overiť a prihlásiť sa' : 'Pokračovať'}<span aria-hidden="true">→</span></button>
          {view !== 'totp' ? <button className="text-button" type="button" onClick={() => { setView(view === 'login' ? 'register' : 'login'); setError(''); }} disabled={busy}>{view === 'login' ? 'Ešte nemáte účet? Vytvoriť účet' : 'Už máte účet? Prihlásiť sa'}</button> : null}
        </form> : null}

        {view === 'dashboard' ? <>
          <div className="account-card"><span className="account-icon" aria-hidden="true">{user?.totpActive ? '✓' : '01'}</span><div><strong>{user?.totpActive ? 'Dvojité overenie je zapnuté' : 'Heslo chráni váš účet'}</strong><p>{user?.totpActive ? 'Pri ďalšom prihlásení zadajte aj kód z autentifikátora.' : 'Pridajte TOTP pre silnejšiu ochranu. Môžete to spraviť teraz alebo neskôr.'}</p></div></div>
          {user?.totpActive ? <div className="factor-status"><span className="status-dot"/> AUTENTIFIKÁTOR AKTÍVNY</div> : <button onClick={startSetup} disabled={busy}>{busy ? 'Pripravujem…' : 'Nastaviť TOTP teraz'}<span aria-hidden="true">→</span></button>}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="text-button" type="button" onClick={logout} disabled={busy}>Odhlásiť sa</button>
        </> : null}

        {view === 'setup' ? <form onSubmit={activateTotp}>
          {enrollment ? <div className="enrollment"><p className="qr-caption">Naskenujte QR kód v 2FAS, Google Authenticatori alebo inej TOTP aplikácii.</p><img src={enrollment.qr} width="220" height="220" alt="QR kód na nastavenie TOTP autentifikátora"/><details><summary>Chcem zadať kľúč ručne</summary><p>Typ: TOTP · SHA-1 · 6 číslic · 30 sekúnd</p><code>{enrollment.secret}</code></details></div> : <p role="status">Pripravujem QR kód…</p>}
          <label htmlFor="setup-code">Potvrďte aktuálnym šesťmiestnym kódom</label><input className="otp" id="setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="000000" disabled={busy}/>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy || !enrollment}>{busy ? 'Overujem kód…' : 'Zapnúť dvojité overenie'}<span aria-hidden="true">→</span></button>
          <button className="text-button" type="button" onClick={() => { setView('dashboard'); setEnrollment(null); setCode(''); setError(''); }} disabled={busy}>Neskôr</button>
        </form> : null}

        {view !== 'loading' && view !== 'dashboard' ? <div className="panel-note"><span aria-hidden="true">◇</span><p>{view === 'register' ? 'Heslo musí mať aspoň 12 znakov. Použite také, ktoré nepoužívate inde.' : view === 'setup' ? 'QR kód a tajný kľúč nezdieľajte. Slúžia na tvorbu vašich jednorazových kódov.' : 'Používame HTTPS. Prihlásenie je platné osem hodín.'}</p></div> : null}
        {view === 'dashboard' ? <div className="panel-note"><span aria-hidden="true">◇</span><p>Relácia vyprší o {Math.floor(remaining / 3600)} h {Math.floor((remaining % 3600) / 60)} min. Údaje TOTP sú šifrované.</p></div> : null}
          </section>
        </div>
      </main>
      <footer className="footer"><span>Bio Token Auth</span></footer>
    </div>
  </div>;
}
createRoot(document.getElementById('root')!).render(<App/>);
