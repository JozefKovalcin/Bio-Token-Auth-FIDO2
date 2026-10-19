import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Eye, EyeOff, Vault } from 'lucide-react';
import './style.css';
import { request, type Capabilities, type Mode, type UserSession } from './auth-api';

const AdvancedLogin = lazy(() => import('./AdvancedLogin').then(module => ({ default: module.AdvancedLogin })));
const SecurityPanel = lazy(() => import('./SecurityPanel').then(module => ({ default: module.SecurityPanel })));
type User = UserSession;
type Enrollment = { secret: string; qr: string };
type View = 'loading' | 'login' | 'register' | 'totp' | 'dashboard' | 'setup';
const heroLines = ['Dva kroky.', 'Jedno bezpečné', 'prihlásenie.'];
const heroCharacterCount = heroLines.join('').length;
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
  const [mode, setMode] = useState<Mode>('A');
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState('');
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [expiresAt, setExpiresAt] = useState(0);
  const [remaining, setRemaining] = useState(0);
  const [heroCharacters, setHeroCharacters] = useState(0);
  const title = useRef<HTMLHeadingElement>(null);
  const initialViewResolved = useRef(false);
  const handleLogin = useCallback((value: UserSession) => {
    setUser(value); setExpiresAt(Date.parse(value.expiresAt)); setMode(value.mode); setView('dashboard'); setError('');
  }, []);
  const refreshSession = useCallback(() => {
    void api<User>('me').then(handleLogin).catch(() => { setUser(null); setView('login'); setMode('A'); });
  }, [handleLogin]);
  useEffect(() => {
    const controller = new AbortController();
    void request<Capabilities>('auth/capabilities', undefined, controller.signal).then(setCapabilities).catch(() => {});
    return () => controller.abort();
  }, []);

  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (reduceMotion.matches) return;
    let frame = 0;
    const updateVaultDepth = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const maxScroll = Math.max(1, document.documentElement.scrollHeight - window.innerHeight);
        const progress = Math.min(window.scrollY / maxScroll, 1);
        document.documentElement.style.setProperty('--vault-shift', `${-24 * progress}px`);
      });
    };
    window.addEventListener('scroll', updateVaultDepth, { passive: true });
    updateVaultDepth();
    return () => {
      window.removeEventListener('scroll', updateVaultDepth);
      cancelAnimationFrame(frame);
      document.documentElement.style.removeProperty('--vault-shift');
    };
  }, []);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setHeroCharacters(heroCharacterCount);
      return;
    }
    let count = 0;
    let timer = 0;
    const typeNextCharacter = () => {
      count += 1;
      setHeroCharacters(count);
      if (count < heroCharacterCount) {
        const lineBreak = heroLines.slice(0, -1).reduce((sum, line) => sum + line.length, 0);
        const secondLineBreak = lineBreak + heroLines[1].length;
        const pause = count === lineBreak || count === secondLineBreak ? 120 : 30;
        timer = window.setTimeout(typeNextCharacter, pause);
      }
    };
    timer = window.setTimeout(typeNextCharacter, 280);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    let alive = true;
    api<User>('me').then(value => {
      if (alive) handleLogin(value);
    }).catch(e => {
      if (alive) { if (!(e instanceof ApiError && e.status === 401)) setError(e.message); setView('login'); }
    });
    return () => { alive = false; };
  }, [handleLogin]);
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
    event.preventDefault();
    if (view === 'register' && password !== passwordConfirm) {
      setError('Zadané heslá sa nezhodujú. Skontrolujte ich a skúste znova.');
      return;
    }
    setBusy(true); setError('');
    try {
      if (view === 'register') {
        const value = await api<User>('register', { username, password });
        setPassword(''); setPasswordConfirm(''); setShowPassword(false); setUser(value); setExpiresAt(Date.parse(value.expiresAt)); setView('dashboard');
      } else if (view === 'login') {
        const result = await api<{ step: 'totp' | 'done'; expiresAt?: string; user?: User }>('password', { username, password });
        setPassword(''); setShowPassword(false);
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
      await api('logout', {}); setUser(null); setEnrollment(null); setCode(''); setPassword(''); setPasswordConfirm(''); setShowPassword(false); setView('login');
    } catch (e) { setError(e instanceof Error ? e.message : 'Odhlásenie sa nepodarilo. Skúste znova.'); }
    finally { setBusy(false); }
  }

  const second = view === 'totp' || view === 'setup';
  const heading = view === 'register' ? 'Vytvorte si účet.' : view === 'totp' ? 'Potvrďte, že ste to vy.' : view === 'setup' ? 'Dodatočná vrstva zabezpečenia.' : view === 'dashboard' ? `Vitajte, ${user?.username}.` : 'Vitajte späť.';
  const firstCurrent = !second && view !== 'dashboard';
  const firstComplete = second || view === 'dashboard';
  const secondCurrent = second;
  const secondComplete = view === 'dashboard' && Boolean(user && (user.mode !== 'A' || user.totpActive));
  return <><a className="skip" href="#auth-title">Prejsť na formulár</a><div className="shell">
    <aside className="visual">
      <a className="brand" href="/" aria-label="Bio Token Auth – domov"><span className="brand-mark" aria-hidden="true"><Vault size={36} strokeWidth={1.6}/></span><span className="brand-type"><span>Bio Token</span><small>Auth</small></span></a>
      <div className="visual-copy">
        <h1 aria-label="Dva kroky. Jedno bezpečné prihlásenie." aria-live="off">{heroLines.map((line, lineIndex) => {
          const start = heroLines.slice(0, lineIndex).reduce((sum, previous) => sum + previous.length, 0);
          const visibleCount = Math.max(0, Math.min(line.length, heroCharacters - start));
          const visible = line.slice(0, visibleCount);
          const emphasisStart = lineIndex === 1 ? line.indexOf('bezpečné') : -1;
          const isTyping = heroCharacters > start && visibleCount < line.length;
          return <span key={line} className="hero-line" aria-hidden="true" data-typing={isTyping || undefined}>
            {emphasisStart < 0 ? visible : <>{visible.slice(0, emphasisStart)}<em>{visible.slice(emphasisStart, emphasisStart + 'bezpečné'.length)}</em>{visible.slice(emphasisStart + 'bezpečné'.length)}</>}
          </span>;
        })}</h1>
        <div className="photo-footer" data-intro-complete={heroCharacters === heroCharacterCount} aria-label="Dva faktory overenia"><div><span>01</span><p>Heslo</p></div><div><span>02</span><p>Autentifikačná aplikácia</p></div></div>
      </div>
    </aside>
    <div className="workspace">
      <header className="topbar"><span className="mode-tag"><strong>Režim {mode}</strong><span>{mode === 'A' ? 'Heslo + TOTP' : mode === 'B' ? 'Heslo + YubiKey' : 'YubiKey + telefón'}</span></span></header>
      <main className="main">
        <div className="form-wrap">
          <ol className="progress" aria-label="Priebeh overenia">
            <li id="factor-one" className={firstCurrent ? 'current' : firstComplete ? 'complete' : ''} aria-current={firstCurrent ? 'step' : undefined}><span className="step-number">01</span><span>{mode === 'C' ? 'YubiKey' : 'Heslo'}</span></li>
            <li id="factor-two" className={secondCurrent ? 'current' : secondComplete ? 'complete' : ''} aria-current={secondCurrent ? 'step' : undefined}><span className="step-number">02</span><span>{mode === 'A' ? 'Autentifikátor' : mode === 'B' ? 'YubiKey' : 'Telefón'}</span></li>
          </ol>
          <section className="panel" aria-busy={busy} aria-labelledby="auth-title">
        <h2 id="auth-title" ref={title} tabIndex={-1}>{view === 'loading' ? 'Načítavam účet…' : heading}</h2>
        <p className="hint">{view === 'register' ? 'Zvoľte si používateľské meno a heslo. Autentifikátor môžete pridať teraz alebo neskôr v účte.' : view === 'totp' ? 'Otvorte 2FAS, Google Authenticator alebo inú TOTP aplikáciu a zadajte aktuálny šesťmiestny kód.' : view === 'setup' ? 'Naskenujte QR kód v autentifikačnej aplikácii a potvrďte prvý kód.' : view === 'dashboard' ? 'Vyberte si, ako chcete chrániť svoj účet.' : mode === 'A' ? 'Zadajte svoje meno a heslo.' : 'Dokončite všetky kroky zvoleného režimu.'}</p>

        {view === 'login' ? <div className="mode-selector" role="group" aria-label="Prihlasovací režim">{(['A', 'B', 'C'] as Mode[]).map(value => <button className="secondary-button" key={value} type="button" aria-pressed={mode === value} disabled={busy || (value !== 'A' && !capabilities?.modes.includes(value))} onClick={() => { setMode(value); setPassword(''); setError(''); }}>Režim {value}</button>)}</div> : null}
        {view === 'login' && mode !== 'A' ? <Suspense fallback={<p role="status">Načítavam overenie…</p>}><AdvancedLogin key={mode} mode={mode} onLogin={handleLogin}/></Suspense> : null}

        {view === 'loading' ? <p className="loading-status" role="status"><span className="busy-indicator" aria-hidden="true"/>Overujem prihlásenie…</p> : null}
        {(view === 'login' && mode === 'A') || view === 'register' || view === 'totp' ? <form onSubmit={submit}>
          {view !== 'totp' ? <>
            <label htmlFor="username">Používateľské meno</label>
            <input id="username" name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} value={username} onChange={e => setUsername(e.target.value.toLowerCase())} required minLength={3} maxLength={64} pattern="[a-z0-9][a-z0-9._\-]{2,63}" placeholder="napr. student" disabled={busy}/>
            <label htmlFor="password">Heslo {view === 'register' ? <span className="label-note">· aspoň 8 znakov</span> : null}</label>
            <div className="password-field">
              <input id="password" name="password" type={showPassword ? 'text' : 'password'} autoComplete={view === 'register' ? 'new-password' : 'current-password'} value={password} onChange={e => setPassword(e.target.value)} required minLength={view === 'register' ? 8 : 1} maxLength={128} disabled={busy}/>
              <button className="password-toggle" type="button" aria-label={showPassword ? 'Skryť heslo' : 'Zobraziť heslo'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={busy}>{showPassword ? <EyeOff size={19} strokeWidth={1.5}/> : <Eye size={19} strokeWidth={1.5}/>}</button>
            </div>
            {view === 'register' ? <>
              <label htmlFor="password-confirm">Potvrďte heslo</label>
              <div className="password-field">
                <input id="password-confirm" name="password-confirm" type={showPassword ? 'text' : 'password'} autoComplete="new-password" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} required minLength={8} maxLength={128} disabled={busy}/>
                <button className="password-toggle" type="button" aria-label={showPassword ? 'Skryť heslo' : 'Zobraziť heslo'} aria-pressed={showPassword} onClick={() => setShowPassword(!showPassword)} disabled={busy}>{showPassword ? <EyeOff size={19} strokeWidth={1.5}/> : <Eye size={19} strokeWidth={1.5}/>}</button>
              </div>
            </> : null}
          </> : <>
            <label htmlFor="code">Kód z autentifikátora</label>
            <input className="otp" id="code" name="code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="000000" disabled={busy}/>
            {view === 'totp' ? <p className="expiry">Na overenie zostáva {Math.floor(remaining / 60)}:{String(remaining % 60).padStart(2, '0')}.</p> : null}
          </>}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy} aria-busy={busy}>{busy ? 'Spracúvam…' : view === 'register' ? 'Vytvoriť účet' : view === 'totp' ? 'Overiť a prihlásiť sa' : 'Pokračovať'}<span aria-hidden="true">{busy ? <i className="busy-indicator"/> : '→'}</span></button>
          {view !== 'totp' ? <button className="text-button" type="button" onClick={() => { setView(view === 'login' ? 'register' : 'login'); setPassword(''); setPasswordConfirm(''); setShowPassword(false); setError(''); }} disabled={busy}>{view === 'login' ? <>Ešte nemáte účet? <span className="link-action">Vytvoriť účet</span></> : <>Už máte účet? <span className="link-action">Prihlásiť sa</span></>}</button> : null}
        </form> : null}

        {view === 'dashboard' ? <>
          {user?.mode !== 'A' ? <p role="status">Prihlásenie režimom {user?.mode}: {user?.mode === 'B' ? 'heslo a YubiKey boli overené.' : 'YubiKey a spárovaný telefón boli overené.'}</p> : null}
          <p><strong>TOTP pre režim A</strong></p>
          <div className="account-card"><span className="account-icon" aria-hidden="true">{user?.totpActive ? '✓' : '01'}</span><div><strong>{user?.totpActive ? 'Dvojité overenie je zapnuté' : 'Heslo chráni váš účet'}</strong><p>{user?.totpActive ? 'Pri ďalšom prihlásení zadajte aj kód z autentifikátora.' : 'Pridajte TOTP pre silnejšiu ochranu. Môžete to spraviť teraz alebo neskôr.'}</p></div></div>
          {user?.totpActive ? <div className="factor-status"><span className="status-dot"/> AUTENTIFIKÁTOR AKTÍVNY</div> : <button onClick={startSetup} disabled={busy}>{busy ? 'Pripravujem…' : 'Nastaviť TOTP teraz'}<span aria-hidden="true">→</span></button>}
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button className="text-button" type="button" onClick={logout} disabled={busy}>Odhlásiť sa</button>
          {user ? <Suspense fallback={<p role="status">Načítavam zabezpečenie…</p>}><SecurityPanel user={user} onSessionChanged={refreshSession}/></Suspense> : null}
        </> : null}

        {view === 'setup' ? <form onSubmit={activateTotp}>
          {enrollment ? <div className="enrollment"><p className="qr-caption">Naskenujte QR kód v 2FAS, Google Authenticatori alebo inej TOTP aplikácii.</p><img src={enrollment.qr} width="220" height="220" alt="QR kód na nastavenie TOTP autentifikátora"/><details><summary>Chcem zadať kľúč ručne</summary><p>Typ: TOTP · SHA-1 · 6 číslic · 30 sekúnd</p><code>{enrollment.secret}</code></details></div> : <p role="status">Pripravujem QR kód…</p>}
          <label htmlFor="setup-code">Potvrďte aktuálnym šesťmiestnym kódom</label><input className="otp" id="setup-code" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" minLength={6} maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required placeholder="000000" disabled={busy}/>
          {error ? <p className="error" role="alert">{error}</p> : null}
          <button type="submit" disabled={busy || !enrollment}>{busy ? 'Overujem kód…' : 'Zapnúť dvojité overenie'}<span aria-hidden="true">→</span></button>
          <button className="text-button" type="button" onClick={() => { setView('dashboard'); setEnrollment(null); setCode(''); setError(''); }} disabled={busy}>Neskôr</button>
        </form> : null}

        {view !== 'loading' && view !== 'dashboard' ? <div className="panel-note"><p>{view === 'register' ? 'Heslo musí mať aspoň 8 znakov. Použite také, ktoré nepoužívate inde.' : view === 'setup' ? 'QR kód a tajný kľúč nezdieľajte. Slúžia na tvorbu vašich jednorazových kódov.' : 'Používame HTTPS. Prihlásenie je platné osem hodín.'}</p></div> : null}
        {view === 'dashboard' ? <div className="panel-note"><p>Relácia vyprší o {Math.floor(remaining / 3600)} h {Math.floor((remaining % 3600) / 60)} min. Údaje TOTP sú šifrované.</p></div> : null}
          </section>
        </div>
      </main>
    </div>
  </div></>;
}
createRoot(document.getElementById('root')!).render(<App/>);
