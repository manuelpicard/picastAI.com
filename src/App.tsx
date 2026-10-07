import React, { useState, useEffect } from 'react';
import {
  Shield,
  Radio,
  BookOpen,
  Headphones,
  Sliders,
  Cpu,
  Activity,
  History,
  CheckCircle,
} from 'lucide-react';
import { DeviceSimulator } from './components/DeviceSimulator';
import { StoryInspector } from './components/StoryInspector';
import { SafetyDemo } from './components/SafetyDemo';
import { ParentDashboard } from './components/ParentDashboard';
import { HoerprobenPlayer } from './components/HoerprobenPlayer';
import { ArchitectureViewer } from './components/ArchitectureViewer';
import { ChapterProgressMap } from './components/ChapterProgressMap.js';
import { WifiSettings } from './types/network.js';
import { Volume2, Volume1, VolumeX } from 'lucide-react';

export function App() {
  const [activeTab, setActiveTab] = useState<'simulator' | 'safety' | 'hoerproben' | 'parents' | 'architecture'>('simulator');
  const [storyState, setStoryState] = useState<any>({
    v: 1,
    ep: 1,
    part: 0,
    target: 5,
    seed: 'Es ist ein nebliger Herbstmorgen.',
    summary: '',
    threads: '',
    hook: '',
    done: false,
  });

  const [activeDeviceId, setActiveDeviceId] = useState<string>('simulator-web');
  const [activeDeviceToken, setActiveDeviceToken] = useState<string>('sim-web-token-xyz-123');
  const [serverHealthy, setServerHealthy] = useState<boolean | null>(null);
  const [turnLogs, setTurnLogs] = useState<any[]>([]);

  // Persistenter Lautstärkeregler (0 bis 100%)
  const [volume, setVolume] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('kunibert_volume');
      return saved !== null ? Math.max(0, Math.min(100, Number(saved))) : 75;
    } catch {
      return 75;
    }
  });
  const [prevVolume, setPrevVolume] = useState<number>(75);

  const handleVolumeChange = (newVal: number) => {
    setVolume(newVal);
    try {
      localStorage.setItem('kunibert_volume', String(newVal));
    } catch {}
  };

  const toggleMute = () => {
    if (volume > 0) {
      setPrevVolume(volume);
      handleVolumeChange(0);
    } else {
      handleVolumeChange(prevVolume > 0 ? prevVolume : 75);
    }
  };

  // Globale WLAN-Netzwerk-Einstellungen zur Fehler-Simulation
  const [wifiSettings, setWifiSettings] = useState<WifiSettings>({
    enabled: true,
    ssid: 'Heimnetzwerk-Kunibert',
    password: 'sicheres-wlan-passwort-2026',
    connected: true,
    status: 'connected',
    signalStrength: 92,
  });

  // Check server health
  useEffect(() => {
    fetch('/health')
      .then((res) => res.json())
      .then((data) => setServerHealthy(data.status === 'ok'))
      .catch(() => setServerHealthy(false));
  }, []);

  const handleLogTurn = (turn: any) => {
    setTurnLogs((prev) => [turn, ...prev.slice(0, 19)]);
  };

  const handleResetState = () => {
    setStoryState({
      v: 1,
      ep: (storyState?.ep || 1) + 1,
      part: 0,
      target: 5,
      seed: 'Über Nacht ist Schnee gefallen.',
      summary: '',
      threads: '',
      hook: '',
      done: false,
    });
  };

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100 flex flex-col">
      {/* Header */}
      <header className="border-b border-stone-800 bg-stone-900/90 backdrop-blur sticky top-0 z-30">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-xl bg-amber-700 flex items-center justify-center text-white shadow-lg shadow-amber-900/40 border border-amber-600">
              <Shield className="w-5 h-5 text-amber-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-bold text-stone-100 tracking-tight">Ritter Kunibert</h1>
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-amber-950 text-amber-300 border border-amber-800">
                  Audio-Prototyp v1.0
                </span>
              </div>
              <p className="text-xs text-stone-400">
                Bildschirmloses Zuhör- und Erzählgerät für Kinder
              </p>
            </div>
          </div>

          {/* Right Status Badges */}
          <div className="flex flex-wrap items-center gap-2 text-xs">
            {/* Persistent Volume Slider in Header */}
            <div className="flex items-center space-x-2 bg-stone-950 px-3 py-1.5 rounded-full border border-stone-800 select-none">
              <button
                onClick={toggleMute}
                className="text-stone-400 hover:text-amber-400 transition cursor-pointer"
                title={volume === 0 ? 'Ton einschalten' : 'Stummschalten'}
              >
                {volume === 0 ? (
                  <VolumeX className="w-4 h-4 text-rose-400" />
                ) : volume < 50 ? (
                  <Volume1 className="w-4 h-4 text-amber-400" />
                ) : (
                  <Volume2 className="w-4 h-4 text-amber-400" />
                )}
              </button>
              <input
                type="range"
                min="0"
                max="100"
                value={volume}
                onChange={(e) => handleVolumeChange(Number(e.target.value))}
                className="w-14 sm:w-20 h-1.5 bg-stone-800 rounded-lg appearance-none cursor-pointer accent-amber-500"
                title={`Lautstärke: ${volume}%`}
              />
              <span className="font-mono text-[11px] text-stone-300 w-8 text-right">
                {volume}%
              </span>
            </div>

            {/* WiFi Connection Indicator Badge */}
            <button
              onClick={() => setActiveTab('parents')}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-full border transition cursor-pointer select-none ${
                wifiSettings.connected
                  ? 'bg-stone-950 hover:bg-stone-900 border-stone-800'
                  : 'bg-rose-950/80 hover:bg-rose-900 border-rose-800 text-rose-200 animate-pulse'
              }`}
              title="WLAN-Status (Klicken für Netzwerk-Einstellungen im Eltern-Bereich)"
            >
              <span className={`w-2 h-2 rounded-full ${wifiSettings.connected ? 'bg-emerald-400' : 'bg-rose-400'}`} />
              <span className="font-mono text-[11px]">
                {wifiSettings.connected ? wifiSettings.ssid : 'WLAN getrennt'}
              </span>
            </button>

            <div className="flex items-center space-x-1.5 bg-stone-950 px-3 py-1.5 rounded-full border border-stone-800">
              <span className={`w-2 h-2 rounded-full ${serverHealthy ? 'bg-emerald-400 animate-pulse' : 'bg-rose-400'}`} />
              <span className="text-stone-300 font-mono text-[11px]">
                {serverHealthy ? 'API Online (:3000)' : 'API offline'}
              </span>
            </div>

            <div className="hidden sm:flex items-center space-x-1.5 bg-stone-950 px-3 py-1.5 rounded-full border border-stone-800">
              <span className="text-stone-400 text-[11px]">Gerät:</span>
              <span className="text-amber-300 font-mono text-[11px] font-semibold">{activeDeviceId}</span>
            </div>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="max-w-6xl mx-auto px-4 flex space-x-1 overflow-x-auto border-t border-stone-850">
          <button
            onClick={() => setActiveTab('simulator')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'simulator'
                ? 'border-amber-500 text-amber-400 bg-amber-950/20'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Radio className="w-4 h-4" />
            Geräte-Simulator
          </button>

          <button
            onClick={() => setActiveTab('safety')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'safety'
                ? 'border-rose-500 text-rose-400 bg-rose-950/20'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Shield className="w-4 h-4" />
            Sicherheitsweiche
          </button>

          <button
            onClick={() => setActiveTab('hoerproben')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'hoerproben'
                ? 'border-purple-500 text-purple-400 bg-purple-950/20'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Headphones className="w-4 h-4" />
            Original-Hörproben (MP3)
          </button>

          <button
            onClick={() => setActiveTab('parents')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'parents'
                ? 'border-blue-500 text-blue-400 bg-blue-950/20'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            Eltern &amp; Geräte
          </button>

          <button
            onClick={() => setActiveTab('architecture')}
            className={`px-4 py-2.5 text-xs font-semibold flex items-center gap-2 border-b-2 transition whitespace-nowrap cursor-pointer ${
              activeTab === 'architecture'
                ? 'border-emerald-500 text-emerald-400 bg-emerald-950/20'
                : 'border-transparent text-stone-400 hover:text-stone-200'
            }`}
          >
            <Cpu className="w-4 h-4" />
            Architektur &amp; GPIO
          </button>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 py-6">
        {activeTab === 'simulator' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <div className="lg:col-span-2 space-y-6">
              <DeviceSimulator
                storyState={storyState}
                onStateUpdate={setStoryState}
                deviceId={activeDeviceId}
                deviceToken={activeDeviceToken}
                onLogTurn={handleLogTurn}
                wifiSettings={wifiSettings}
                onNavigateToNetworkSettings={() => setActiveTab('parents')}
                volume={volume}
              />

              {/* Visual Chapter Progress Map / Chart */}
              <ChapterProgressMap storyState={storyState} />
            </div>
            <div className="space-y-6">
              <StoryInspector
                storyState={storyState}
                onResetState={handleResetState}
              />

              {/* Recent Turns History Card */}
              {turnLogs.length > 0 && (
                <div className="bg-stone-900 border border-stone-800 rounded-2xl p-5 shadow-xl text-xs">
                  <div className="flex items-center space-x-2 border-b border-stone-800 pb-3 mb-3 text-stone-300 font-bold">
                    <History className="w-4 h-4 text-amber-400" />
                    <span>Letzte Turns</span>
                  </div>
                  <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
                    {turnLogs.map((log, idx) => (
                      <div key={idx} className="p-2.5 rounded-lg bg-stone-950 border border-stone-850 space-y-1">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-amber-400 uppercase tracking-wide">
                            {log.mode} → {log.kind}
                          </span>
                          <span className="text-stone-500">{log.timestamp}</span>
                        </div>
                        <p className="text-stone-300 italic line-clamp-2">„{log.text}“</p>
                        <span className="text-[10px] font-mono text-stone-500 block">ID: {log.turn_id}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'safety' && (
          <div className="max-w-4xl mx-auto">
            <SafetyDemo
              onTestSafetyPrompt={(prompt) => {
                setActiveTab('simulator');
              }}
            />
          </div>
        )}

        {activeTab === 'hoerproben' && (
          <div className="max-w-4xl mx-auto">
            <HoerprobenPlayer />
          </div>
        )}

        {activeTab === 'parents' && (
          <div className="max-w-4xl mx-auto">
            <ParentDashboard
              currentDeviceId={activeDeviceId}
              onSelectDevice={(id, tok) => {
                setActiveDeviceId(id);
                setActiveDeviceToken(tok);
              }}
              wifiSettings={wifiSettings}
              onUpdateWifiSettings={setWifiSettings}
            />
          </div>
        )}

        {activeTab === 'architecture' && (
          <div className="max-w-4xl mx-auto">
            <ArchitectureViewer />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-800 bg-stone-900/60 py-4 text-xs text-stone-400 text-center">
        <div className="max-w-6xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
          <span>
            Ritter Kunibert – Prototyp eines kindgerechten Zuhör- und Erzählgeräts (picast.com)
          </span>
          <span className="text-stone-500">
            Datensparsam • Ohne Display • Deterministische Schutzweiche
          </span>
        </div>
      </footer>
    </div>
  );
}

export default App;
