import { useCallback, useEffect, useRef, useState } from 'react';
import type { PublicKeyCredentialCreationOptionsJSON, PublicKeyCredentialRequestOptionsJSON } from '@simplewebauthn/browser';
import { AdvancedLogin } from './AdvancedLogin';
import { readableError, request, type Capabilities, type Mode, type UserSession } from './auth-api';

type Credential = { id: string; profile: 'B' | 'C'; state: string; createdAt: string };
type Device = { id: string; label: string; status: string };
type Pairing = { pairingId: string; status: string; expiresAt: string; candidate?: { deviceId: string; label: string; confirmationCode: string } };
const stateLabel = (value: string) => ({ CANDIDATE: 'čaká na overenie', ACTIVE: 'aktívny', REVOKED: 'odvolaný', AWAITING_PC_CONFIRMATION: 'čaká na potvrdenie' }[value] ?? 'nepripravený');

export function SecurityPanel({ user, onSessionChanged }: { user: UserSession; onSessionChanged: () => void }) {
  const [open, setOpen] = useState(false);
  const [capabilities, setCapabilities] = useState<Capabilities | null>(null);
  const [credentials, setCredentials] = useState<Credential[]>([]);
  const [devices, setDevices] = useState<Device[]>([]);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [modes, setModes] = useState<Mode[]>(user.allowedModes ?? [user.mode]);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [pairing, setPairing] = useState<Pairing | null>(null);
  const [qr, setQr] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [activation, setActivation] = useState(false);
  const [activationProof, setActivationProof] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const load = useCallback(async (signal?: AbortSignal) => {
    const [caps, keys, phones] = await Promise.all([
      request<Capabilities>('auth/capabilities', undefined, signal),
      request<{ credentials: Credential[] }>('account/webauthn', undefined, signal),
      request<Device[]>('account/devices', undefined, signal),
    ]);
    if (!signal?.aborted && alive.current) { setCapabilities(caps); setCredentials(keys.credentials); setDevices(phones); }
  }, []);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    void load(controller.signal).catch(value => { if (!controller.signal.aborted) setError(readableError(value)); });
    return () => controller.abort();
  }, [open, load]);

  useEffect(() => {
    if (!pairing || pairing.status === 'CONFIRMED') return;
    const controller = new AbortController(); let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      if (Date.parse(pairing.expiresAt) <= Date.now()) { setQr(''); setPairing(null); setError('Párovanie vypršalo. Začnite znova.'); return; }
      try {
        const result = await request<Pairing>(`account/pairings/${encodeURIComponent(pairing.pairingId)}`, undefined, controller.signal);
        if (controller.signal.aborted) return;
        if (['EXPIRED', 'CANCELLED'].includes(result.status)) { setQr(''); setPairing(null); return; }
        if (result.candidate) { setPairing(result); setQr(''); return; }
      } catch (value) { if (!controller.signal.aborted) setError(readableError(value)); }
      if (!controller.signal.aborted) timer = setTimeout(poll, 2000);
    };
    if (!pairing.candidate) void poll();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pairing]);

  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError(''); setNotice('');
    try { await work(); }
    catch (value) { if (alive.current) setError(readableError(value)); }
    finally { if (alive.current) setBusy(false); }
  }

  async function grant(scope: 'ENROLL' | 'REVOKE' | 'POLICY') {
    const result = await request<{ grant: string }>('account/reauth', { scope, ...(password ? { password } : {}), ...(code ? { code } : {}) });
    setPassword(''); setCode(''); return result.grant;
  }
  async function enroll(profile: 'B' | 'C') {
    const proof = await grant('ENROLL');
    const options = await request<{ registrationId: string; options: PublicKeyCredentialCreationOptionsJSON }>('account/webauthn/registrations/options', { profile, grant: proof });
    const { startRegistration } = await import('@simplewebauthn/browser');
    const response = await startRegistration({ optionsJSON: options.options });
    if (!alive.current) return;
    const result = await request<{ credentialId: string }>('account/webauthn/registrations/verify', { registrationId: options.registrationId, response });
    setCandidate(result.credentialId); setNotice('Kľúč bol zaregistrovaný. Potvrďte jeho použitie, aby sa aktivoval.'); await load();
  }
  async function activate() {
    const options = await request<{ proofId: string; options: PublicKeyCredentialRequestOptionsJSON }>('account/webauthn/activations/options', { credentialId: candidate });
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const response = await startAuthentication({ optionsJSON: options.options });
    if (!alive.current) return;
    await request('account/webauthn/activations/verify', { proofId: options.proofId, response });
    setCandidate(null); setNotice('Kľúč je aktívny. Povolené režimy účtu môžete upraviť nižšie.'); await load();
  }
  async function startPairing() {
    const proofGrant = await grant('ENROLL');
    const proofOptions = await request<{ proofId: string; options: PublicKeyCredentialRequestOptionsJSON }>('account/webauthn/proofs/options', { purpose: 'PAIRING' });
    const { startAuthentication } = await import('@simplewebauthn/browser');
    const response = await startAuthentication({ optionsJSON: proofOptions.options });
    await request('account/webauthn/proofs/verify', { proofId: proofOptions.proofId, response });
    if (!alive.current) return;
    const result = await request<{ pairingId: string; expiresAt: string; qr: object }>('account/pairings', { proofId: proofOptions.proofId, grant: proofGrant });
    const QRCode = await import('qrcode');
    setQr(await QRCode.toDataURL(JSON.stringify(result.qr)));
    setPairing({ pairingId: result.pairingId, expiresAt: result.expiresAt, status: 'PENDING' });
  }
  const handleActivation = useCallback((proof: string) => { setActivationProof(proof); setActivation(false); setNotice('Oba faktory C sú overené. Teraz môžete uložiť požadované režimy.'); }, []);
  const unexpectedLogin = useCallback(() => { setActivation(false); onSessionChanged(); }, [onSessionChanged]);

  return <section className="security-panel" aria-label="Správa zabezpečenia">
    <button className="text-button" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>Bezpečnostné kľúče, telefóny a režimy</button>
    {open ? <div aria-busy={busy}>
      <p className="hint">Citlivé zmeny vyžadujú čerstvé overenie. Ak ste sa prihlásili pred chvíľou, údaje nemusíte zadávať znova.</p>
      <label htmlFor="security-password">Heslo na opätovné overenie</label><input id="security-password" type="password" autoComplete="current-password" maxLength={128} value={password} onChange={event => setPassword(event.target.value)} disabled={busy}/>
      <label htmlFor="security-otp">TOTP kód, ak je zapnutý</label><input id="security-otp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ''))} disabled={busy}/>
      <p><strong>YubiKey</strong></p>
      {credentials.map(key => <div className="security-item" key={key.id}><span>Režim {key.profile} · {stateLabel(key.state)}</span>
        {key.state === 'CANDIDATE' ? <button className="text-button" disabled={busy} onClick={() => setCandidate(key.id)}>Potvrdiť kľúč</button> : null}
        {key.state !== 'REVOKED' ? <button className="text-button" disabled={busy} onClick={() => void run(async () => { await request(`account/webauthn/${encodeURIComponent(key.id)}/revoke`, { grant: await grant('REVOKE') }); onSessionChanged(); })}>Odvolať</button> : null}
      </div>)}
      <div className="security-actions"><button disabled={busy || !capabilities?.webauthnEnabled} onClick={() => void run(() => enroll('B'))}>Pridať YubiKey pre B</button><button disabled={busy || !capabilities?.webauthnEnabled} onClick={() => void run(() => enroll('C'))}>Pridať YubiKey pre C</button></div>
      {candidate ? <button disabled={busy} onClick={() => void run(activate)}>Potvrdiť nový kľúč</button> : null}
      <p><strong>Spárované telefóny</strong></p>
      {devices.map(device => <div className="security-item" key={device.id}><span>{device.label} · {stateLabel(device.status)}</span>{device.status !== 'REVOKED' ? <button className="text-button" disabled={busy} onClick={() => void run(async () => { await request(`account/devices/${encodeURIComponent(device.id)}/revoke`, { grant: await grant('REVOKE') }); onSessionChanged(); })}>Odvolať</button> : null}</div>)}
      <button disabled={busy || !capabilities?.modeCEnabled || Boolean(pairing)} onClick={() => void run(startPairing)}>Spárovať telefón cez YubiKey C</button>
      {qr ? <div className="enrollment"><img src={qr} width={220} height={220} alt="Jednorazový QR kód na párovanie telefónu"/><p>Naskenujte v aplikácii Bio Token. Na oboch zariadeniach porovnajte kód.</p></div> : null}
      {pairing?.candidate ? <form onSubmit={event => { event.preventDefault(); void run(async () => {
        await request(`account/pairings/${encodeURIComponent(pairing.pairingId)}/confirm`, { deviceId: pairing.candidate!.deviceId, confirmationCode: confirmation });
        setPairing(null); setQr(''); setConfirmation(''); setNotice('Telefón je spárovaný.'); await load();
      }); }}><p>Nový telefón: <strong>{pairing.candidate.label}</strong>. Porovnávací kód: <strong>{pairing.candidate.confirmationCode}</strong>.</p><label htmlFor="pair-code">Zadajte kód z telefónu</label><input id="pair-code" required value={confirmation} onChange={event => setConfirmation(event.target.value)} maxLength={64} disabled={busy}/><button disabled={busy}>Potvrdiť toto zariadenie</button></form> : null}
      <fieldset disabled={busy}><legend>Povolené režimy účtu</legend>{(['A', 'B', 'C'] as Mode[]).map(mode => <label className="mode-choice" key={mode}><input type="checkbox" checked={modes.includes(mode)} disabled={mode !== 'A' && !capabilities?.modes.includes(mode)} onChange={event => setModes(current => event.target.checked ? [...current, mode] : current.filter(value => value !== mode))}/>Režim {mode}</label>)}</fieldset>
      {capabilities?.modeCEnabled ? <button disabled={busy} onClick={() => setActivation(true)}>Overiť oba faktory pred zapnutím C</button> : <p className="hint">Režim C nie je na tomto serveri dostupný.</p>}
      {activation ? <AdvancedLogin mode="C" activation onLogin={unexpectedLogin} onActivation={handleActivation}/> : null}
      <button disabled={busy || modes.length === 0} onClick={() => void run(async () => {
        await request('account/policy', { allowedModes: modes, grant: await grant('POLICY'), ...(activationProof ? { activationProofId: activationProof } : {}) });
        setActivationProof(''); setNotice('Politika bola zmenená. Prihláste sa podľa nových pravidiel.'); onSessionChanged();
      })}>Uložiť povolené režimy</button>
      {notice ? <p role="status">{notice}</p> : null}{error ? <p className="error" role="alert">{error}</p> : null}
    </div> : null}
  </section>;
}
