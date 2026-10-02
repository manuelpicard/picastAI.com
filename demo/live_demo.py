"""Live-Demo: echter Pi-Client -> echter Server (Whisper + Sprachmodell + Piper).

Kinderäußerungen werden mit einer zweiten Piper-Stimme (kerstin) eingesprochen,
auf 16 kHz/mono gebracht und wie eine echte Mikrofonaufnahme gesendet.
Der Server läuft mit KUNIBERT_DIAGNOSTIC_TEXT=1, damit hier der Text der
Antworten fürs Protokoll mitgeschrieben werden kann (im Betrieb: aus).
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
import time
import wave
from pathlib import Path
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "pi-client"))
from kunibert_pi import __main__ as pi_cli  # noqa: E402
from kunibert_pi.api import KunibertAPI  # noqa: E402

DEMO = ROOT / "demo"
OUT = DEMO / "out"
VOICE_CHILD = ROOT / "server" / "voices" / "de_DE-kerstin-low.onnx"

STEPS = [
    ("frage", "himmel", "Warum ist der Himmel eigentlich blau?"),
    ("frage", "kunibert-wer", "Wer ist Ritter Kunibert?"),
    ("frage", "traurig", "Ich bin traurig, weil mein Freund heute nicht mit mir spielen wollte."),
    ("frage", "sicherheit", "Ich habe mich verlaufen und finde Mama nicht mehr."),
    ("geschichte", "folge-teil1", "Erzähl mir eine Geschichte mit einem Einhorn."),
    ("weiter", "folge-teil2", None),
    ("weiter", "folge-teil3", None),
    ("weiter", "folge-teil4", None),
    ("weiter", "folge-teil5", None),
]


def child_wav(text: str, path: Path) -> None:
    from piper import PiperVoice

    voice = PiperVoice.load(str(VOICE_CHILD))
    raw = path.with_suffix(".raw.wav")
    with wave.open(str(raw), "wb") as w:
        voice.synthesize_wav(text, w)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(raw), "-ac", "1", "-ar", "16000",
                    "-sample_fmt", "s16", str(path)], check=True)
    raw.unlink()


def main() -> int:
    only = set(sys.argv[1].split(",")) if len(sys.argv) > 1 else None  # z. B. "frage"
    steps = [s for s in STEPS if only is None or s[0] in only]
    OUT.mkdir(parents=True, exist_ok=True)
    for old in OUT.glob("*"):
        old.unlink()
    state_file = Path("/dev/shm/kunibert-demo.json")
    state_file.unlink(missing_ok=True)
    env = {"KUNIBERT_API_BASE": "http://127.0.0.1:8000", "KUNIBERT_DEVICE_ID": "demo-pi",
           "KUNIBERT_DEVICE_TOKEN": (DEMO / ".token").read_text().strip(),
           "KUNIBERT_DEMO_OUT": str(OUT), "PATH": f"{DEMO / 'bin'}:{os.environ['PATH']}"}

    captured: list[dict] = []
    original = KunibertAPI._request

    def recording_request(self, path, **kwargs):
        body, mime = original(self, path, **kwargs)
        if path == "/v1/turn":
            captured.append(json.loads(body))
        return body, mime

    log = []
    with patch.dict(os.environ, env), patch.object(KunibertAPI, "_request", recording_request):
        for mode, label, utterance in steps:
            args = ["--mode", mode, "--state-file", str(state_file)]
            if utterance:
                wav_path = OUT / f"kind-{label}.wav"
                child_wav(utterance, wav_path)
                args += ["--wav", str(wav_path)]
            os.environ["KUNIBERT_DEMO_LABEL"] = label
            started = time.monotonic()
            code = pi_cli.main(args)
            seconds = time.monotonic() - started
            reply = captured[-1] if captured else {}
            entry = {"mode": mode, "label": label, "kind_said": utterance, "exit": code,
                     "seconds": round(seconds, 1), "kind": reply.get("kind"), "text": reply.get("text"),
                     "part": reply.get("story_state", {}).get("part")}
            log.append(entry)
            print(json.dumps(entry, ensure_ascii=False), flush=True)
    (DEMO / "demo-protokoll.json").write_text(json.dumps(log, ensure_ascii=False, indent=2), "utf-8")
    state_file.unlink(missing_ok=True)
    return 0 if all(e["exit"] == 0 for e in log) else 1


if __name__ == "__main__":
    raise SystemExit(main())
