"""Kommandozeile.

  python3 -m kunibert_server add-device prototype-1      # Token einmalig anzeigen
  python3 -m kunibert_server revoke-device prototype-1
  python3 -m kunibert_server list-devices
  python3 -m kunibert_server serve --host 127.0.0.1 --port 8000
  python3 -m kunibert_server say --mode geschichte --out teil1.wav --state-file /dev/shm/k.json
  python3 -m kunibert_server say --mode frage --text "Warum ist der Himmel blau?" --out antwort.wav
"""
from __future__ import annotations

import argparse
import json
import logging
import os
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent.parent


def env(name: str, default: str) -> str:
    return os.environ.get(name, default)


def build_brain(*, need_stt: bool = True):
    from .brain import Brain, Settings
    from .providers import FakeSTT, OpenAICompatibleLLM, PiperTTS, WhisperSTT

    settings = Settings(
        age=env("KUNIBERT_AGE", "sechs bis zehn"),
        parts_per_episode=int(env("KUNIBERT_PARTS_PER_EPISODE", "5")),
    )
    stt = (WhisperSTT(env("KUNIBERT_WHISPER_MODEL", "small")) if need_stt else FakeSTT())
    # Kurze Antworten: schnell. Geschichten: sprachlich stärker, minimale Denkzeit (~13 s).
    llm = OpenAICompatibleLLM(env("KUNIBERT_ANSWER_MODEL", "gpt-5-mini"),
                              reasoning_effort=env("KUNIBERT_ANSWER_REASONING", "low") or None)
    story_llm = OpenAICompatibleLLM(env("KUNIBERT_STORY_MODEL", "gpt-5"),
                                    reasoning_effort=env("KUNIBERT_STORY_REASONING", "minimal") or None)
    tts = PiperTTS(env("KUNIBERT_PIPER_VOICE", str(HERE / "voices" / "de_DE-thorsten-medium.onnx")))
    return Brain(stt, llm, tts, settings, story_llm=story_llm)


def registry():
    from .devices import DeviceRegistry

    return DeviceRegistry(Path(env("KUNIBERT_DEVICES_FILE", str(HERE / "devices.json"))))


def fixed_audio(brain) -> dict[str, bytes]:
    """Festansagen einmal beim Start erzeugen: schnell, gleichbleibend, fachlich prüfbar."""
    from . import safety

    return {"sicherheit": brain.tts.synthesize(safety.SAFETY_RESPONSE_DE),
            "unklar": brain.tts.synthesize(safety.UNCLEAR_RESPONSE_DE),
            "fehler": brain.tts.synthesize(safety.ERROR_RESPONSE_DE)}


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(prog="kunibert_server", description="Ritter Kunibert – Server")
    sub = parser.add_subparsers(dest="cmd", required=True)
    p_add = sub.add_parser("add-device")
    p_add.add_argument("device_id")
    p_rev = sub.add_parser("revoke-device")
    p_rev.add_argument("device_id")
    sub.add_parser("list-devices")
    p_srv = sub.add_parser("serve")
    p_srv.add_argument("--host", default="127.0.0.1")
    p_srv.add_argument("--port", type=int, default=8000)
    p_say = sub.add_parser("say", help="Text statt Mikrofon: Pipeline ausprobieren, WAV speichern")
    p_say.add_argument("--mode", choices=("frage", "geschichte", "weiter"), required=True)
    p_say.add_argument("--text", default="", help="Frage oder Geschichtenwunsch als Text")
    p_say.add_argument("--state-file", type=Path, help="Geschichtenstand zwischen Aufrufen")
    p_say.add_argument("--out", type=Path, required=True)
    args = parser.parse_args(argv)

    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(name)s %(message)s")

    if args.cmd == "add-device":
        token = registry().add(args.device_id)
        print(f"Gerät {args.device_id} angelegt. Token (wird nur jetzt angezeigt):\n{token}")
        return 0
    if args.cmd == "revoke-device":
        ok = registry().revoke(args.device_id)
        print("widerrufen" if ok else "unbekanntes Gerät")
        return 0 if ok else 1
    if args.cmd == "list-devices":
        print(json.dumps(registry().list(), indent=2))
        return 0
    if args.cmd == "serve":
        import uvicorn

        from .app import create_app
        from .devices import AudioStore, RateLimiter

        brain = build_brain()
        app = create_app(
            brain, registry(),
            store=AudioStore(ttl_seconds=float(env("KUNIBERT_AUDIO_TTL", "120"))),
            limiter=RateLimiter(int(env("KUNIBERT_RATE_LIMIT", "30")), 600),
            diagnostic_text=env("KUNIBERT_DIAGNOSTIC_TEXT", "0") == "1",
            fixed_audio=fixed_audio(brain))
        uvicorn.run(app, host=args.host, port=args.port, log_level="info")
        return 0
    if args.cmd == "say":
        import numpy as np

        from .brain import TurnResult

        brain = build_brain(need_stt=False)
        state = json.loads(args.state_file.read_text("utf-8")) if args.state_file and args.state_file.exists() else {}
        # Text direkt einspeisen: STT überspringen, Rest der Pipeline identisch.
        brain.stt.text = args.text
        samples = np.full(16000, 0.1, dtype=np.float32) if args.text else None
        result: TurnResult = brain.handle(args.mode, samples, state)
        wav = brain.speak(result)
        args.out.write_bytes(wav)
        if args.state_file:
            args.state_file.write_text(json.dumps(result.story_state, ensure_ascii=False), "utf-8")
        print(f"[{result.kind}] {result.speech}\n-> {args.out}")
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
