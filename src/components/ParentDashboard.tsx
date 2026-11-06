import React, { useState, useEffect } from 'react';
import {
  Key,
  ShieldCheck,
  Plus,
  Trash2,
  RefreshCw,
  AlertCircle,
  Copy,
  Check,
  Wifi,
  WifiOff,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Signal,
  CheckCircle2,
  Sliders,
} from 'lucide-react';
import { WifiSettings } from '../types/network.js';

export interface ParentDashboardProps {
  currentDeviceId: string;
  onSelectDevice: (deviceId: string, token: string) => void;
  wifiSettings: WifiSettings;
  onUpdateWifiSettings: (settings: WifiSettings) => void;
}

export const ParentDashboard: React.FC<ParentDashboardProps> = ({
  currentDeviceId,
  onSelectDevice,
  wifiSettings,
  onUpdateWifiSettings,
}) => {
  const [devices, setDevices] = useState<any[]>([]);
  const [newDeviceId, setNewDeviceId] = useState('');
  const [newDeviceName, setNewDeviceName] = useState('');
  const [lastCreatedToken, setLastCreatedToken] = useState<{ id: string; token: string } | null>(null);
  const [statusMetrics, setStatusMetrics] = useState<any>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adminToken, setAdminToken] = useState('');
  const [adminAccessState, setAdminAccessState] = useState<'locked' | 'checking' | 'unlocked' | 'error' | 'unconfigured'>('locked');
  const [adminError, setAdminError] = useState('');

  // WLAN Formular Zustand
  const [ssidInput, setSsidInput] = useState(wifiSettings.ssid);
  const [passwordInput, setPasswordInput] = useState(wifiSettings.password);
  const [showPassword, setShowPassword] = useState(false);
  const [testingWifi, setTestingWifi] = useState(false);
  const [wifiNotice, setWifiNotice] = useState<string | null>(null);

  // Synchronisiere Inputs bei Änderungen von außen
  useEffect(() => {
    setSsidInput(wifiSettings.ssid);
    setPasswordInput(wifiSettings.password);
  }, [wifiSettings.ssid, wifiSettings.password]);

  const fetchDevices = async (token = adminToken): Promise<boolean> => {
    if (!token) return false;
    try {
      const res = await fetch('/api/devices', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDevices(data.devices || []);
        setAdminAccessState('unlocked');
        setAdminError('');
        return true;
      }
      setDevices([]);
      if (res.status === 503) {
        setAdminAccessState('unconfigured');
        setAdminError('Auf dem Server ist kein ausreichend langes Admin-Token konfiguriert.');
      } else {
        setAdminAccessState('error');
        setAdminError('Admin-Token ungültig oder Zugriff verweigert.');
      }
    } catch (err) {
      console.warn('Fehler beim Laden der Geräte:', err);
      setAdminAccessState('error');
      setAdminError('Server nicht erreichbar.');
    }
    return false;
  };

  const fetchStatus = async (token = adminToken) => {
    if (!token) return;
    try {
      const res = await fetch(`/api/status?device=${encodeURIComponent(currentDeviceId)}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setStatusMetrics(data);
      }
    } catch (err) {
      console.warn('Fehler beim Laden des Status:', err);
    }
  };

  useEffect(() => {
    if (adminAccessState !== 'unlocked') return;
    fetchDevices();
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, [currentDeviceId, adminAccessState]);

  const handleAdminLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!adminToken) return;
    setAdminAccessState('checking');
    setAdminError('');
    const authorized = await fetchDevices(adminToken);
    if (authorized) await fetchStatus(adminToken);
  };

  const handleAdminLogout = () => {
    setAdminToken('');
    setAdminAccessState('locked');
    setAdminError('');
    setDevices([]);
    setStatusMetrics(null);
    setLastCreatedToken(null);
  };

  const handleCreateDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDeviceId) return;
    setLoading(true);

    try {
      const res = await fetch('/api/devices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminToken}` },
        body: JSON.stringify({ deviceId: newDeviceId, name: newDeviceName }),
      });

      if (res.ok) {
        const data = await res.json();
        setLastCreatedToken({ id: data.deviceId, token: data.token });
        setNewDeviceId('');
        setNewDeviceName('');
        fetchDevices();
      } else {
        const err = await res.json();
        alert(err.error || 'Fehler beim Erstellen');
      }
    } catch (err: any) {
      alert(err.message || 'Netzwerkfehler');
    } finally {
      setLoading(false);
    }
  };

  const handleRevokeDevice = async (id: string) => {
    if (!confirm(`Gerät ${id} wirklich widerrufen? Das Gerät kann dann keine Audio-Anfragen mehr stellen.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/devices/${encodeURIComponent(id)}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${adminToken}` },
      });
      if (res.ok) {
        fetchDevices();
      }
    } catch (err) {
      console.error('Fehler beim Widerrufen:', err);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // WLAN Einstellungen speichern & Verbindung simulieren
  const handleApplyWifi = (e: React.FormEvent) => {
    e.preventDefault();
    setTestingWifi(true);
    setWifiNotice(null);

    setTimeout(() => {
      setTestingWifi(false);
      // Validierung: Wenn Passwort falsch oder zu kurz ist, Fehlerfall simulieren
      const isWrongPass = passwordInput.toLowerCase().includes('falsch') || passwordInput.length < 8;
      const isWrongSsid = ssidInput.toLowerCase().includes('offline') || ssidInput.toLowerCase().includes('kein');

      if (!wifiSettings.enabled) {
        onUpdateWifiSettings({
          ...wifiSettings,
          ssid: ssidInput,
          password: passwordInput,
          connected: false,
          status: 'disabled',
          lastError: 'WLAN ist am Schalter deaktiviert',
        });
        setWifiNotice('WLAN-Daten gespeichert, aber WLAN ist derzeit ausgeschaltet.');
      } else if (isWrongPass) {
        onUpdateWifiSettings({
          ...wifiSettings,
          ssid: ssidInput,
          password: passwordInput,
          connected: false,
          status: 'auth_failed',
          lastError: 'Authentifizierung fehlgeschlagen: Ungültiger WPA2/WPA3 Pre-Shared Key (Passwort falsch)',
        });
        setWifiNotice('Verbindungsfehler: Passwort wurde vom WLAN-Router abgelehnt!');
      } else if (isWrongSsid) {
        onUpdateWifiSettings({
          ...wifiSettings,
          ssid: ssidInput,
          password: passwordInput,
          connected: false,
          status: 'no_signal',
          lastError: 'Kein Access Point gefunden: SSID antwortet nicht auf Probe Requests',
        });
        setWifiNotice('Verbindungsfehler: Das angegebene WLAN wurde nicht gefunden.');
      } else {
        onUpdateWifiSettings({
          ...wifiSettings,
          ssid: ssidInput,
          password: passwordInput,
          connected: true,
          status: 'connected',
          signalStrength: 88,
          lastError: undefined,
        });
        setWifiNotice(`Erfolgreich mit «${ssidInput}» verbunden! Internetzugang aktiv.`);
      }
    }, 800);
  };

  const handleToggleWifiMaster = () => {
    const nextEnabled = !wifiSettings.enabled;
    onUpdateWifiSettings({
      ...wifiSettings,
      enabled: nextEnabled,
      connected: nextEnabled && wifiSettings.status === 'connected',
      status: nextEnabled ? 'connected' : 'disabled',
      lastError: nextEnabled ? undefined : 'WLAN per Eltern-Schalter deaktiviert',
    });
  };

  const applyPreset = (type: 'valid' | 'wrong_pass' | 'no_signal' | 'offline') => {
    if (type === 'valid') {
      const valid = {
        enabled: true,
        ssid: 'Heimnetzwerk-Kunibert',
        password: 'sicheres-wlan-passwort-2026',
        connected: true,
        status: 'connected' as const,
        signalStrength: 92,
        lastError: undefined,
      };
      setSsidInput(valid.ssid);
      setPasswordInput(valid.password);
      onUpdateWifiSettings(valid);
      setWifiNotice('Preset angewendet: Gültiges Heim-WLAN verbunden.');
    } else if (type === 'wrong_pass') {
      const wrong = {
        enabled: true,
        ssid: 'Heimnetzwerk-Kunibert',
        password: 'falsches-passwort-xyz',
        connected: false,
        status: 'auth_failed' as const,
        signalStrength: 75,
        lastError: 'Authentifizierungsfehler (4-Way Handshake fehlgeschlagen: Falscher WPA-Key)',
      };
      setSsidInput(wrong.ssid);
      setPasswordInput(wrong.password);
      onUpdateWifiSettings(wrong);
      setWifiNotice('Preset angewendet: Falsches Passwort simuliert! Teste jetzt den Geräte-Simulator.');
    } else if (type === 'no_signal') {
      const noSignal = {
        enabled: true,
        ssid: 'Garten-WLAN-Weit-Weg',
        password: 'passwort12345678',
        connected: false,
        status: 'no_signal' as const,
        signalStrength: 0,
        lastError: 'Beacon Timeout: Signal zu schwach oder SSID außer Reichweite',
      };
      setSsidInput(noSignal.ssid);
      setPasswordInput(noSignal.password);
      onUpdateWifiSettings(noSignal);
      setWifiNotice('Preset angewendet: Außer Reichweite simuliert.');
    } else if (type === 'offline') {
      const off = {
        enabled: false,
        ssid: wifiSettings.ssid,
        password: wifiSettings.password,
        connected: false,
        status: 'disabled' as const,
        signalStrength: 0,
        lastError: 'WLAN-Modul deaktiviert (Flugmodus / Offline)',
      };
      onUpdateWifiSettings(off);
      setWifiNotice('Preset angewendet: WLAN komplett ausgeschaltet.');
    }
  };

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-xl space-y-6">
      <div className="flex items-center justify-between border-b border-stone-800 pb-4">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-950/60 border border-amber-800/80 rounded-xl text-amber-400">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold text-stone-100">Eltern- &amp; Geräteverwaltung (picastAI.com)</h3>
            <p className="text-xs text-stone-400">Geräteauthentifizierung, WLAN-Netzwerk-Steuerung und Datenschutz-Garantien</p>
          </div>
        </div>
        <button
          onClick={() => {
            fetchDevices();
            fetchStatus();
          }}
          className="p-2 text-stone-400 hover:text-stone-200 bg-stone-800 hover:bg-stone-700 rounded-lg transition"
          title="Aktualisieren"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>

      {/* Privacy Architecture Notice */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-emerald-400 block mb-1">Keine Audio-Speicherung</span>
          <p className="text-stone-400 leading-relaxed">
            Kinder-Aufnahmen werden flüchtig im RAM verarbeitet und nie auf einer Festplatte persistiert.
          </p>
        </div>
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-emerald-400 block mb-1">Flüchtige Zustände (120 s TTL)</span>
          <p className="text-stone-400 leading-relaxed">
            WAV-Antworten werden genau einmal vom erzeugenden Gerät abgerufen und danach sofort gelöscht.
          </p>
        </div>
        <div className="bg-stone-950 p-3.5 rounded-xl border border-stone-800">
          <span className="font-semibold text-amber-400 block mb-1">Rate-Limiter Aktiv</span>
          <p className="text-stone-400 leading-relaxed">
            {statusMetrics?.rateLimit
              ? `${statusMetrics.rateLimit.remaining} von ${statusMetrics.rateLimit.max} Anfragen in 10 Min verfügbar.`
              : 'Schutz vor Überlastung aktiv.'}
          </p>
        </div>
      </div>

      <div className="bg-stone-950 p-4 rounded-xl border border-stone-800 space-y-2">
        <form onSubmit={handleAdminLogin} className="flex flex-col sm:flex-row gap-2">
          <label htmlFor="admin-token" className="sr-only">Server-Admin-Token</label>
          <input
            id="admin-token"
            type="password"
            value={adminToken}
            onChange={(e) => setAdminToken(e.target.value)}
            placeholder="Server-Admin-Token"
            autoComplete="off"
            spellCheck={false}
            disabled={adminAccessState === 'unlocked'}
            className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500 font-mono"
          />
          <button
            type="submit"
            disabled={!adminToken || adminAccessState === 'checking' || adminAccessState === 'unlocked'}
            className="px-4 py-2 bg-amber-700 hover:bg-amber-600 text-white rounded-lg text-xs font-semibold disabled:opacity-50"
          >
            {adminAccessState === 'checking' ? 'Prüfe …' : 'Adminzugang prüfen'}
          </button>
          {adminAccessState === 'unlocked' && (
            <button
              type="button"
              onClick={handleAdminLogout}
              className="px-4 py-2 bg-stone-800 hover:bg-stone-700 text-stone-200 rounded-lg text-xs font-semibold"
            >
              Abmelden
            </button>
          )}
        </form>
        <p className={`text-[11px] ${adminAccessState === 'unlocked' ? 'text-emerald-400' : adminError ? 'text-rose-300' : 'text-stone-500'}`}>
          {adminAccessState === 'unlocked'
            ? 'Verwaltung freigeschaltet. Das Token bleibt nur im Speicher dieses Tabs.'
            : adminError || 'Geräteverwaltung ist gesperrt, bis ein gültiges Server-Admin-Token eingegeben wurde.'}
        </p>
      </div>

      {/* ------------------------------------------------------------ */}
      {/* Netzwerk-Einstellungen (WLAN / WiFi Steuerung) */}
      {/* ------------------------------------------------------------ */}
      <div className="bg-stone-950 p-5 rounded-xl border border-stone-800 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-stone-850 pb-3">
          <div className="flex items-center space-x-2.5">
            <div className={`p-2 rounded-lg border ${
              wifiSettings.connected
                ? 'bg-emerald-950/60 border-emerald-800 text-emerald-400'
                : 'bg-rose-950/60 border-rose-800 text-rose-400'
            }`}>
              {wifiSettings.connected ? <Wifi className="w-5 h-5" /> : <WifiOff className="w-5 h-5 animate-pulse" />}
            </div>
            <div>
              <h4 className="text-sm font-bold text-stone-100 flex items-center gap-2">
                Netzwerk-Einstellungen (WLAN / WiFi)
                <span className={`text-[10px] px-2 py-0.5 rounded-full font-mono uppercase tracking-wider ${
                  wifiSettings.connected
                    ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                    : wifiSettings.status === 'auth_failed'
                    ? 'bg-rose-950 text-rose-300 border border-rose-800'
                    : 'bg-amber-950 text-amber-300 border border-amber-800'
                }`}>
                  {wifiSettings.connected ? 'Online' : 'Offline / Fehler'}
                </span>
              </h4>
              <p className="text-xs text-stone-400">
                Simuliere WLAN-Zugangsdaten (SSID/Passwort), um das Fehlerverhalten des Audio-Geräts zu testen.
              </p>
            </div>
          </div>

          {/* Master WLAN Toggle Switch */}
          <div className="flex items-center space-x-2 bg-stone-900 px-3 py-1.5 rounded-xl border border-stone-800">
            <span className="text-xs font-medium text-stone-400">WLAN-Modul:</span>
            <button
              onClick={handleToggleWifiMaster}
              className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer ${
                wifiSettings.enabled
                  ? 'bg-emerald-950 text-emerald-300 border border-emerald-800'
                  : 'bg-stone-800 text-stone-400 border border-stone-700'
              }`}
            >
              {wifiSettings.enabled ? <Wifi className="w-3.5 h-3.5" /> : <WifiOff className="w-3.5 h-3.5" />}
              {wifiSettings.enabled ? 'Aktiviert' : 'Deaktiviert'}
            </button>
          </div>
        </div>

        {/* Current Connection Status Box */}
        <div className={`p-3.5 rounded-xl border flex items-start gap-3 text-xs ${
          wifiSettings.connected
            ? 'bg-emerald-950/20 border-emerald-800/60 text-emerald-200'
            : 'bg-rose-950/20 border-rose-800/60 text-rose-200'
        }`}>
          {wifiSettings.connected ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-0.5">
            <p className="font-semibold">
              {wifiSettings.connected
                ? `Verbunden mit «${wifiSettings.ssid}» (Signal: ${wifiSettings.signalStrength || 90}%)`
                : wifiSettings.status === 'auth_failed'
                ? `Verbindungsfehler bei «${wifiSettings.ssid}»: Falsches WLAN-Passwort`
                : wifiSettings.status === 'no_signal'
                ? `WLAN «${wifiSettings.ssid}» nicht gefunden (Außer Reichweite)`
                : 'WLAN-Verbindung ist deaktiviert'}
            </p>
            {wifiSettings.lastError && (
              <p className="text-[11px] font-mono opacity-80">{wifiSettings.lastError}</p>
            )}
            {!wifiSettings.connected && (
              <p className="text-[11px] text-amber-300/90 pt-1">
                💡 <em>Im Geräte-Simulator blinkt jetzt die rote Fehler-LED und der Pi spielt die kindgerechte Offline-Ansage ab.</em>
              </p>
            )}
          </div>
        </div>

        {/* Edit Credentials Form */}
        <form onSubmit={handleApplyWifi} className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-stone-300 font-semibold mb-1 flex items-center gap-1.5">
                <Wifi className="w-3.5 h-3.5 text-amber-400" />
                WLAN-Name (SSID):
              </label>
              <input
                type="text"
                value={ssidInput}
                onChange={(e) => setSsidInput(e.target.value)}
                placeholder="z. B. Heimnetzwerk-FRITZBox"
                className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 text-stone-100 focus:outline-none focus:border-amber-500 font-mono text-xs"
                required
              />
            </div>

            <div>
              <label className="block text-stone-300 font-semibold mb-1 flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                WLAN-Passwort (WPA2/WPA3 Key):
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Mindestens 8 Zeichen..."
                  className="w-full bg-stone-900 border border-stone-700 rounded-lg px-3 py-2 pr-9 text-stone-100 focus:outline-none focus:border-amber-500 font-mono text-xs"
                  required
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-2.5 top-2.5 text-stone-400 hover:text-stone-200 transition"
                  title={showPassword ? 'Verbergen' : 'Anzeigen'}
                >
                  {showPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <button
              type="submit"
              disabled={testingWifi}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${testingWifi ? 'animate-spin' : ''}`} />
              {testingWifi ? 'WLAN wird getestet...' : 'WLAN-Zugangsdaten anwenden'}
            </button>

            {wifiNotice && (
              <span className="text-xs text-amber-300 italic animate-fade-in font-medium">
                {wifiNotice}
              </span>
            )}
          </div>
        </form>

        {/* Quick Testing Presets for Connectivity Error Simulation */}
        <div className="pt-3 border-t border-stone-850">
          <span className="text-[11px] font-semibold text-stone-400 uppercase tracking-wide block mb-2">
            Schnell-Szenarien für Fehler-Simulation im Gerät:
          </span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => applyPreset('valid')}
              className="p-2 text-left bg-stone-900 hover:bg-emerald-950/40 border border-stone-800 hover:border-emerald-700 rounded-lg text-xs transition cursor-pointer"
            >
              <span className="font-semibold text-emerald-400 block text-[11px]">🟢 Gültig (Online)</span>
              <span className="text-[10px] text-stone-400">Normalbetrieb mit Internet</span>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('wrong_pass')}
              className="p-2 text-left bg-stone-900 hover:bg-rose-950/40 border border-stone-800 hover:border-rose-700 rounded-lg text-xs transition cursor-pointer"
            >
              <span className="font-semibold text-rose-400 block text-[11px]">🔴 Falsches Passwort</span>
              <span className="text-[10px] text-stone-400">Handshake-Fehler simulieren</span>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('no_signal')}
              className="p-2 text-left bg-stone-900 hover:bg-amber-950/40 border border-stone-800 hover:border-amber-700 rounded-lg text-xs transition cursor-pointer"
            >
              <span className="font-semibold text-amber-400 block text-[11px]">🟡 Kein Signal</span>
              <span className="text-[10px] text-stone-400">SSID außer Reichweite</span>
            </button>

            <button
              type="button"
              onClick={() => applyPreset('offline')}
              className="p-2 text-left bg-stone-900 hover:bg-stone-800 border border-stone-800 hover:border-stone-700 rounded-lg text-xs transition cursor-pointer"
            >
              <span className="font-semibold text-stone-300 block text-[11px]">⚫ WLAN Aus</span>
              <span className="text-[10px] text-stone-400">Flugmodus / Offline-Test</span>
            </button>
          </div>
        </div>
      </div>

      {/* Generated Token Alert */}
      {lastCreatedToken && (
        <div className="p-4 bg-amber-950/40 border border-amber-600 rounded-xl text-xs space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-bold text-amber-200 flex items-center gap-1.5">
              <Key className="w-4 h-4 text-amber-400" />
              Neues Geräte-Token für «{lastCreatedToken.id}» generiert:
            </span>
            <button
              onClick={() => copyToClipboard(lastCreatedToken.token)}
              className="px-2 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded flex items-center gap-1 transition"
            >
              {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>
          <p className="font-mono text-amber-100 bg-stone-950 p-2 rounded border border-amber-800/80 break-all select-all">
            {lastCreatedToken.token}
          </p>
          <p className="text-stone-400 text-[11px]">
            Wichtig: Dieses Token wird nur als SHA-256-Hash gespeichert und kann später nicht erneut angezeigt werden.
            Trage es auf dem Raspberry Pi in <code className="text-amber-300">/etc/kunibert/kunibert.env</code> ein.
          </p>
        </div>
      )}

      {/* Registered Devices List */}
      {adminAccessState === 'unlocked' ? (
      <div>
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300 mb-3">
          Registrierte Geräte
        </h4>
        <div className="space-y-2">
          {devices.map((dev) => (
            <div
              key={dev.deviceId}
              className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition ${
                dev.deviceId === currentDeviceId
                  ? 'bg-amber-950/20 border-amber-700/60'
                  : 'bg-stone-950 border-stone-800'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-stone-200">{dev.name || dev.deviceId}</span>
                  <span className="font-mono text-stone-400">({dev.deviceId})</span>
                  {dev.deviceId === currentDeviceId && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-900/60 text-amber-300 border border-amber-700 text-[10px]">
                      Aktives Simulator-Gerät
                    </span>
                  )}
                  {dev.revoked && (
                    <span className="px-2 py-0.5 rounded-full bg-rose-950 text-rose-300 border border-rose-800 text-[10px]">
                      Widerrufen (Gesperrt)
                    </span>
                  )}
                </div>
                <p className="text-stone-500 text-[11px]">
                  Erstellt: {new Date(dev.created * 1000).toLocaleString('de-DE')}
                </p>
              </div>

              <div className="flex items-center gap-2">
                {!dev.revoked && (
                  <button
                    onClick={() => handleRevokeDevice(dev.deviceId)}
                    className="p-1.5 text-stone-400 hover:text-rose-400 hover:bg-stone-800 rounded transition cursor-pointer"
                    title="Zugang widerrufen"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
      ) : (
        <div className="p-4 bg-stone-950 rounded-xl border border-stone-800 text-xs text-stone-400">
          Geräteliste und Verwaltung werden erst nach erfolgreicher Admin-Authentifizierung geladen.
        </div>
      )}

      {/* Add New Device Form */}
      {adminAccessState === 'unlocked' && (
      <div className="pt-4 border-t border-stone-800">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300 mb-3">
          Neues Gerät registrieren
        </h4>
        <form onSubmit={handleCreateDevice} className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <input
            type="text"
            value={newDeviceId}
            onChange={(e) => setNewDeviceId(e.target.value)}
            placeholder="Geräte-ID (z. B. kinderzimmer-pi)"
            className="bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
            required
          />
          <input
            type="text"
            value={newDeviceName}
            onChange={(e) => setNewDeviceName(e.target.value)}
            placeholder="Bezeichnung (z. B. Kinderzimmer Pi 4)"
            className="bg-stone-950 border border-stone-700 rounded-lg px-3 py-2 text-xs text-stone-100 focus:outline-none focus:border-amber-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 transition disabled:opacity-50 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            Gerät hinzufügen
          </button>
        </form>
      </div>
      )}

      {/* Environmental Variables & Server Configuration Inspector */}
      {statusMetrics?.config && (
        <div className="pt-4 border-t border-stone-800">
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-stone-300 flex items-center gap-1.5">
              <span>Aktive Umgebungsvariablen (Environmental Variables)</span>
            </h4>
            <span className="text-[11px] font-mono text-amber-400 bg-amber-950/60 px-2 py-0.5 rounded border border-amber-800">
              .env / kunibert.env
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 text-xs">
            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_AGE</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.ageBracket}</p>
              <p className="text-stone-500 text-[10px]">Alterszielgruppe für Sprachkomplexität</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_PARTS_PER_EPISODE</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.partsPerEpisode} Kapitel pro Folge</p>
              <p className="text-stone-500 text-[10px]">Start → Mitte → List → Finale</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_RATE_LIMIT</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.rateLimit}</p>
              <p className="text-stone-500 text-[10px]">Kinderschutz vor Dauerüberflutung</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_AUDIO_TTL</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.audioTtlSeconds}</p>
              <p className="text-stone-500 text-[10px]">WAV nach 1x Abruf sofort vernichtet</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_AUDIO_SAMPLE_RATE</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.audioSampleRate}</p>
              <p className="text-stone-500 text-[10px]">Pi-Hardware Standard 16 kHz Mono</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_EMERGENCY_NUMBERS</span>
              <p className="font-bold text-rose-300">112 &amp; Nummer gegen Kummer</p>
              <p className="text-stone-500 text-[10px]">
                {statusMetrics.config.emergencyNumberPrimary} / {statusMetrics.config.emergencyNumberKummer}
              </p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">PICASTAI_LLM_PROVIDER</span>
              <p className="font-bold text-stone-200">
                {statusMetrics.config.llmProvider === 'anthropic' && statusMetrics.config.hasAnthropicKey ? (
                  <span className="text-emerald-400">
                    {statusMetrics.config.llmProvider}: {statusMetrics.config.llmModel}
                  </span>
                ) : (
                  <span className="text-stone-400">Offline-Erzählmotor aktiv</span>
                )}
              </p>
              <p className="text-stone-500 text-[10px]">Schlüssel verlässt nie den Server</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">KUNIBERT_DIAGNOSTIC_TEXT</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.diagnosticText ? 'Aktiv (1)' : 'Inaktiv (0)'}</p>
              <p className="text-stone-500 text-[10px]">Antworttext für Web-Simulator &amp; Logs</p>
            </div>

            <div className="bg-stone-950 p-3 rounded-xl border border-stone-800 space-y-1">
              <span className="font-mono text-stone-400 text-[11px]">PORT &amp; HOST</span>
              <p className="font-bold text-stone-200">{statusMetrics.config.host}:{statusMetrics.config.port}</p>
              <p className="text-stone-500 text-[10px]">HTTP-Schnittstelle für Pi-Client</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
