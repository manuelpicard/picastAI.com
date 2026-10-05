import React, { useState, useRef, useEffect } from 'react';
import {
  Mic,
  BookOpen,
  Volume2,
  VolumeX,
  Radio,
  Play,
  Square,
  Sparkles,
  ShieldAlert,
  ArrowRight,
  Info,
} from 'lucide-react';

export interface DeviceSimulatorProps {
  storyState: any;
  onStateUpdate: (newState: any) => void;
  deviceId: string;
  deviceToken: string;
  onLogTurn: (turn: any) => void;
}

type LedState = 'bereit' | 'aufnahme' | 'verarbeitung' | 'wiedergabe' | 'fehler' | 'mic_off';

export const DeviceSimulator: React.FC<DeviceSimulatorProps> = ({
  storyState,
  onStateUpdate,
  deviceId,
  deviceToken,
  onLogTurn,
}) => {
  const [ledState, setLedState] = useState<LedState>('bereit');
  const [micHardwareOff, setMicHardwareOff] = useState<boolean>(false);
  const [isPressingSprechtaste, setIsPressingSprechtaste] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Bereit für Tastendruck');
  const [currentSpeech, setCurrentSpeech] = useState<string>('');
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [customQuestion, setCustomQuestion] = useState<string>('');
  const [customWish, setCustomWish] = useState<string>('mit einem Einhorn');
  const [voicePlaybackEnabled, setVoicePlaybackEnabled] = useState<boolean>(true);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Update LED when mic hardware switch toggles
  useEffect(() => {
    if (micHardwareOff) {
      setLedState('mic_off');
      setStatusMessage('Mikrofon physisch getrennt (GPIO 22 aktiv)');
    } else {
      if (ledState === 'mic_off') {
        setLedState('bereit');
        setStatusMessage('Bereit für Tastendruck');
      }
    }
  }, [micHardwareOff]);

  // Clean up speech synthesis on unmount
  useEffect(() => {
    return () => {
      if ('speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  const speakText = (text: string, onEnd?: () => void) => {
    if (!voicePlaybackEnabled || !('speechSynthesis' in window)) {
      if (onEnd) onEnd();
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'de-DE';
    utterance.rate = 0.95; // Ruhiges Vorlesen für Kinder
    utterance.pitch = 0.95;

    // Pick German voice if available
    const voices = window.speechSynthesis.getVoices();
    const deVoice = voices.find((v) => v.lang.startsWith('de') && !v.name.includes('Google')) ||
                    voices.find((v) => v.lang.startsWith('de'));
    if (deVoice) {
      utterance.voice = deVoice;
    }

    utterance.onend = () => {
      if (onEnd) onEnd();
    };

    utterance.onerror = () => {
      if (onEnd) onEnd();
    };

    window.speechSynthesis.speak(utterance);
  };

  const executeTurn = async (mode: 'frage' | 'geschichte' | 'weiter', text: string, audioBlob?: Blob) => {
    if (micHardwareOff && mode === 'frage') {
      setLedState('fehler');
      setStatusMessage('Mikrofon ist ausgeschaltet! Bitte Schalter umlegen.');
      setTimeout(() => setLedState(micHardwareOff ? 'mic_off' : 'bereit'), 2000);
      return;
    }

    setLedState('verarbeitung');
    setStatusMessage(`Verarbeite ${mode}...`);
    setCurrentSpeech('');

    const formData = new FormData();
    formData.append('mode', mode);
    formData.append('story_state', JSON.stringify(storyState || {}));

    if (text) {
      formData.append('text', text);
    }

    if (audioBlob) {
      formData.append('audio', audioBlob, 'input.wav');
    }

    try {
      const response = await fetch('/v1/turn', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${deviceToken}`,
          'X-Device-Id': deviceId,
        },
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      setCurrentSpeech(data.text);
      if (data.story_state) {
        onStateUpdate(data.story_state);
      }

      onLogTurn({
        mode,
        kind: data.kind,
        text: data.text,
        turn_id: data.turn_id,
        timestamp: new Date().toLocaleTimeString(),
      });

      // LED auf Wiedergabe stellen
      setLedState('wiedergabe');
      setStatusMessage(`Antwort wird abgespielt (${data.kind})`);

      // 1. WAV Audio von der API abrufen
      try {
        const audioRes = await fetch(`/v1/turn/${data.turn_id}/audio`, {
          headers: {
            Authorization: `Bearer ${deviceToken}`,
            'X-Device-Id': deviceId,
          },
        });
        if (audioRes.ok) {
          const blob = await audioRes.blob();
          const url = URL.createObjectURL(blob);
          setActiveAudioUrl(url);
          if (audioRef.current) {
            audioRef.current.src = url;
            audioRef.current.play().catch(() => {});
          }
        }
      } catch (audioFetchErr) {
        console.warn('WAV playback fetch error:', audioFetchErr);
      }

      // 2. Synthetisierte deutsche Vorlesestimme starten
      speakText(data.text, () => {
        setLedState('bereit');
        setStatusMessage('Bereit für nächsten Tastendruck');
      });
    } catch (err: any) {
      console.error('Turn error:', err);
      setLedState('fehler');
      setStatusMessage(`Fehler: ${err.message || 'Verbindungsfehler'}`);
      setTimeout(() => {
        setLedState(micHardwareOff ? 'mic_off' : 'bereit');
        setStatusMessage('Bereit für Tastendruck');
      }, 3000);
    }
  };

  // Start Sprechtaste recording (Push-to-talk)
  const startRecording = async () => {
    if (micHardwareOff) {
      setStatusMessage('Mikrofon getrennt! Schalter oben rechts beachten.');
      return;
    }

    setIsPressingSprechtaste(true);
    setLedState('aufnahme');
    setStatusMessage('Aufnahme läuft... Sprechen oder Taste loslassen');

    try {
      if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioChunksRef.current = [];
        const recorder = new MediaRecorder(stream);
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) audioChunksRef.current.push(e.data);
        };

        recorder.start();
      }
    } catch (err) {
      console.warn('Kein Mikrofon-Zugriff:', err);
      // Fallback: Custom text question
    }
  };

  // Stop Sprechtaste recording & send
  const stopRecording = () => {
    if (!isPressingSprechtaste) return;
    setIsPressingSprechtaste(false);

    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.onstop = () => {
        const blob = new Blob(audioChunksRef.current, { type: 'audio/wav' });
        // Falls kein gesprochener Text vorliegt, übergeben wir den Eingabetext
        executeTurn('frage', customQuestion || 'Warum ist der Himmel eigentlich blau?', blob);
        // Tracks stoppen
        mediaRecorderRef.current?.stream.getTracks().forEach((t) => t.stop());
      };
      mediaRecorderRef.current.stop();
    } else {
      executeTurn('frage', customQuestion || 'Warum ist der Himmel eigentlich blau?');
    }
  };

  // Erzähltaste drücken (Startet neue Folge oder setzt fort)
  const handleErzahltaste = () => {
    if (storyState && storyState.part > 0 && !storyState.done) {
      // Weiter
      executeTurn('weiter', '');
    } else {
      // Neue Geschichte mit optionalem Wunsch
      executeTurn('geschichte', customWish);
    }
  };

  const isStoryOngoing = storyState && storyState.part > 0 && !storyState.done;

  return (
    <div className="bg-stone-900 border border-stone-800 rounded-2xl p-6 shadow-2xl relative overflow-hidden">
      {/* Wooden Case Accent Top Bar */}
      <div className="flex items-center justify-between border-b border-stone-800 pb-4 mb-6">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-amber-900/40 border border-amber-700/50 rounded-xl text-amber-400">
            <Radio className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-xl font-bold tracking-tight text-amber-100 flex items-center gap-2">
              Ritter Kunibert Gerät
              <span className="text-xs px-2 py-0.5 rounded-full bg-stone-800 text-stone-400 border border-stone-700 font-mono">
                RPi Client
              </span>
            </h2>
            <p className="text-xs text-stone-400">Bildschirmloses Zuhör- und Erzählgerät für Kinder (6–10 Jahre)</p>
          </div>
        </div>

        {/* Hardware Mic Mute Switch (GPIO 22) */}
        <div className="flex items-center space-x-3 bg-stone-950 px-3 py-2 rounded-xl border border-stone-800">
          <span className="text-xs font-medium text-stone-400">Mikrofon-Schalter (GPIO 22):</span>
          <button
            onClick={() => setMicHardwareOff(!micHardwareOff)}
            className={`px-3 py-1 text-xs font-semibold rounded-lg flex items-center gap-1.5 transition-colors ${
              micHardwareOff
                ? 'bg-rose-950 text-rose-300 border border-rose-800'
                : 'bg-emerald-950 text-emerald-300 border border-emerald-800'
            }`}
          >
            {micHardwareOff ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
            {micHardwareOff ? 'Mikrofon AUS' : 'Mikrofon AKTIV'}
          </button>
        </div>
      </div>

      {/* Main Physical Enclosure Simulator */}
      <div className="bg-gradient-to-b from-stone-800 to-stone-850 p-6 rounded-2xl border-2 border-stone-700 shadow-inner max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs tracking-wider uppercase font-semibold text-stone-400">
            Hardware-Frontblende (Original BCM Pins)
          </span>

          {/* LED Indicator (GPIO 17) */}
          <div className="flex items-center space-x-2 bg-stone-900/90 px-3 py-1.5 rounded-full border border-stone-700">
            <span className="text-xs text-stone-400">Status-LED (GPIO 17):</span>
            <div
              className={`w-3.5 h-3.5 rounded-full border transition-all duration-300 ${
                ledState === 'aufnahme'
                  ? 'bg-red-500 border-red-300 animate-led-fast shadow-[0_0_10px_#ef4444]'
                  : ledState === 'verarbeitung'
                  ? 'bg-amber-400 border-amber-200 animate-led-slow shadow-[0_0_12px_#f59e0b]'
                  : ledState === 'wiedergabe'
                  ? 'bg-emerald-400 border-emerald-200 animate-led-steady shadow-[0_0_12px_#10b981]'
                  : ledState === 'fehler'
                  ? 'bg-rose-600 border-rose-300 animate-led-error'
                  : 'bg-stone-700 border-stone-600'
              }`}
            />
            <span className="text-xs font-mono font-medium text-stone-300 capitalize">{ledState}</span>
          </div>
        </div>

        {/* Speaker Mesh Grille */}
        <div className="h-28 bg-stone-900 rounded-xl border border-stone-700/80 p-4 mb-6 flex flex-col items-center justify-center relative overflow-hidden">
          <div className="grid grid-cols-12 gap-2 opacity-30 pointer-events-none">
            {Array.from({ length: 48 }).map((_, i) => (
              <div key={i} className="w-1.5 h-1.5 rounded-full bg-stone-500" />
            ))}
          </div>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            {ledState === 'wiedergabe' ? (
              <div className="flex items-center space-x-1.5 text-amber-400 animate-pulse">
                <Volume2 className="w-6 h-6 animate-bounce" />
                <span className="text-sm font-semibold tracking-wide">Kunibert spricht...</span>
              </div>
            ) : ledState === 'verarbeitung' ? (
              <span className="text-xs text-amber-400/90 font-medium">Server generiert Turn...</span>
            ) : (
              <span className="text-xs text-stone-500 font-medium">Lautsprecher bereit</span>
            )}
          </div>
        </div>

        {/* Hardware Push-Buttons */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
          {/* Sprechtaste (GPIO 5) */}
          <div className="flex flex-col items-center p-5 bg-stone-900/60 rounded-xl border border-stone-700/70 hover:border-amber-600/40 transition">
            <div className="text-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-rose-400">GPIO 5</span>
              <h3 className="text-base font-semibold text-stone-200">Sprechtaste</h3>
              <p className="text-xs text-stone-400">Gedrückt halten &amp; Frage stellen</p>
            </div>

            <button
              onMouseDown={startRecording}
              onMouseUp={stopRecording}
              onTouchStart={startRecording}
              onTouchEnd={stopRecording}
              disabled={micHardwareOff || ledState === 'verarbeitung'}
              className={`w-28 h-28 rounded-full flex flex-col items-center justify-center border-4 shadow-xl transition-all active:scale-95 ${
                micHardwareOff
                  ? 'bg-stone-800 border-stone-700 text-stone-600 cursor-not-allowed'
                  : isPressingSprechtaste
                  ? 'bg-rose-600 border-rose-300 text-white shadow-rose-900/50 scale-95'
                  : 'bg-rose-700 hover:bg-rose-600 border-rose-500 text-rose-100 shadow-rose-950/80 cursor-pointer'
              }`}
            >
              <Mic className="w-9 h-9 mb-1" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {isPressingSprechtaste ? 'Aufnahme...' : 'Drücken'}
              </span>
            </button>
          </div>

          {/* Erzähltaste (GPIO 6) */}
          <div className="flex flex-col items-center p-5 bg-stone-900/60 rounded-xl border border-stone-700/70 hover:border-amber-600/40 transition">
            <div className="text-center mb-3">
              <span className="text-xs font-bold uppercase tracking-wider text-amber-400">GPIO 6</span>
              <h3 className="text-base font-semibold text-stone-200">Erzähltaste</h3>
              <p className="text-xs text-stone-400">
                {isStoryOngoing
                  ? `Folge ${storyState.ep}: Teil ${storyState.part} von ${storyState.target}`
                  : 'Neue Geschichte starten'}
              </p>
            </div>

            <button
              onClick={handleErzahltaste}
              disabled={ledState === 'verarbeitung'}
              className="w-28 h-28 rounded-full flex flex-col items-center justify-center border-4 shadow-xl bg-amber-600 hover:bg-amber-500 border-amber-400 text-amber-50 shadow-amber-950/80 cursor-pointer active:scale-95 transition-all"
            >
              <BookOpen className="w-9 h-9 mb-1" />
              <span className="text-xs font-bold uppercase tracking-wide">
                {isStoryOngoing ? 'Weiter »' : 'Erzählen'}
              </span>
            </button>
          </div>
        </div>

        {/* Status Display Bar */}
        <div className="bg-stone-950 px-4 py-2.5 rounded-lg border border-stone-800 flex items-center justify-between text-xs">
          <span className="text-stone-400 font-mono">Status: {statusMessage}</span>
          <div className="flex items-center space-x-2">
            <button
              onClick={() => setVoicePlaybackEnabled(!voicePlaybackEnabled)}
              className="text-stone-400 hover:text-amber-300 flex items-center gap-1"
              title="Browser-Vorlesestimme umschalten"
            >
              {voicePlaybackEnabled ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-stone-500" />}
              <span>{voicePlaybackEnabled ? 'Stimme an' : 'Stimme stumm'}</span>
            </button>
          </div>
        </div>
      </div>

      {/* Simulator Inputs & Helpers */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Question Simulator Input */}
        <div className="bg-stone-950/80 p-4 rounded-xl border border-stone-800">
          <label className="block text-xs font-semibold text-stone-300 mb-2 flex items-center gap-1.5">
            <Mic className="w-3.5 h-3.5 text-rose-400" />
            Frage per Text simulieren (oder oben Sprechtaste halten):
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customQuestion}
              onChange={(e) => setCustomQuestion(e.target.value)}
              placeholder="z. B. Warum ist der Himmel eigentlich blau?"
              className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-rose-500"
            />
            <button
              onClick={() => executeTurn('frage', customQuestion || 'Warum ist der Himmel eigentlich blau?')}
              disabled={micHardwareOff || ledState === 'verarbeitung'}
              className="px-3 py-1.5 bg-rose-700 hover:bg-rose-600 text-white rounded-lg text-xs font-semibold transition"
            >
              Senden
            </button>
          </div>

          {/* Quick presets */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <button
              onClick={() => setCustomQuestion('Warum ist der Himmel eigentlich blau?')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „Himmel blau?“
            </button>
            <button
              onClick={() => setCustomQuestion('Wer ist Ritter Kunibert?')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „Wer ist Kunibert?“
            </button>
            <button
              onClick={() => setCustomQuestion('Ich bin traurig, weil mein Freund heute nicht mit mir spielen wollte.')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „Gefühl: traurig“
            </button>
          </div>
        </div>

        {/* Story Wish Input */}
        <div className="bg-stone-950/80 p-4 rounded-xl border border-stone-800">
          <label className="block text-xs font-semibold text-stone-300 mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Wunsch des Kindes für neue Folge:
          </label>
          <div className="flex gap-2">
            <input
              type="text"
              value={customWish}
              onChange={(e) => setCustomWish(e.target.value)}
              placeholder="z. B. mit einem Einhorn"
              className="flex-1 bg-stone-900 border border-stone-700 rounded-lg px-3 py-1.5 text-xs text-stone-100 placeholder:text-stone-500 focus:outline-none focus:border-amber-500"
            />
            <button
              onClick={() => executeTurn('geschichte', customWish)}
              disabled={ledState === 'verarbeitung'}
              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold transition"
            >
              Starten
            </button>
          </div>

          {/* Quick wish presets */}
          <div className="flex flex-wrap gap-1.5 mt-2.5">
            <button
              onClick={() => setCustomWish('mit einem Einhorn')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „mit einem Einhorn“
            </button>
            <button
              onClick={() => setCustomWish('mit einem kleinen Hund')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „mit einem Hund“
            </button>
            <button
              onClick={() => setCustomWish('mit einem Zauberschwert')}
              className="text-[11px] bg-stone-800 hover:bg-stone-700 text-stone-300 px-2 py-0.5 rounded border border-stone-700"
            >
              „mit Zauberschwert“
            </button>
          </div>
        </div>
      </div>

      {/* Transcript of Current Speech */}
      {currentSpeech && (
        <div className="mt-6 p-4 rounded-xl bg-amber-950/30 border border-amber-800/40">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
              <Volume2 className="w-4 h-4" />
              Kuniberts Antwort (Text &amp; Audio):
            </span>
            <button
              onClick={() => speakText(currentSpeech)}
              className="text-xs text-amber-300 hover:text-amber-100 underline cursor-pointer"
            >
              Erneut vorlesen
            </button>
          </div>
          <p className="text-sm leading-relaxed text-stone-200 italic font-serif">
            „{currentSpeech}“
          </p>
        </div>
      )}

      {/* Hidden audio element for WAV playback */}
      <audio ref={audioRef} className="hidden" />
    </div>
  );
};
