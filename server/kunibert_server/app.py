"""HTTP-Schnittstelle – exakt der Vertrag, den der Pi-Client erwartet.

POST /v1/turn              multipart: mode, story_state (JSON), audio (WAV)
GET  /v1/turn/{id}/audio   einmaliger Abruf, nur für das erzeugende Gerät
GET  /health               ohne Kinderinformationen
"""
from __future__ import annotations

import json
import logging
import threading
import time

from fastapi import FastAPI, File, Form, Header, HTTPException, Request, UploadFile
from fastapi.responses import JSONResponse, Response

from .audio import MAX_INPUT_BYTES, AudioError, decode_input_wav
from .brain import Brain, TurnResult
from .devices import AudioStore, DeviceRegistry, RateLimiter

log = logging.getLogger("kunibert.api")

MAX_BODY_BYTES = MAX_INPUT_BYTES + 64 * 1024
MODES = {"frage", "geschichte", "weiter"}


def create_app(brain: Brain, registry: DeviceRegistry, *, store: AudioStore | None = None,
               limiter: RateLimiter | None = None, diagnostic_text: bool = False,
               fixed_audio: dict[str, bytes] | None = None) -> FastAPI:
    app = FastAPI(title="Ritter Kunibert – Geräte-API", docs_url=None, redoc_url=None, openapi_url=None)
    store = store or AudioStore()
    limiter = limiter or RateLimiter(30, 600)
    busy: set[str] = set()
    busy_lock = threading.Lock()
    fixed_audio = dict(fixed_audio or {})
    app.state.store = store

    @app.middleware("http")
    async def limit_body(request: Request, call_next):
        if request.method == "POST":
            length = request.headers.get("content-length")
            if length is None:
                return JSONResponse({"error": "length_required"}, status_code=411)
            if not length.isdigit() or int(length) > MAX_BODY_BYTES:
                return JSONResponse({"error": "too_large"}, status_code=413)
        response = await call_next(request)
        response.headers["Cache-Control"] = "no-store"
        return response

    def authenticate(authorization: str | None, device_id: str | None) -> str:
        token = (authorization or "")[7:] if (authorization or "").startswith("Bearer ") else ""
        if not device_id or not registry.verify(device_id, token):
            raise HTTPException(status_code=401, detail="unauthorized")
        return device_id

    @app.get("/health")
    def health():
        return {"status": "ok"}

    @app.post("/v1/turn")
    def turn(mode: str = Form(...), story_state: str = Form("{}"),
             audio: UploadFile | None = File(None),
             authorization: str | None = Header(None),
             x_device_id: str | None = Header(None)):
        device = authenticate(authorization, x_device_id)
        if mode not in MODES:
            raise HTTPException(status_code=400, detail="bad_mode")
        if len(story_state.encode("utf-8")) > 4096:
            raise HTTPException(status_code=400, detail="state_too_large")
        try:
            state = json.loads(story_state or "{}")
        except json.JSONDecodeError:
            state = {}

        samples = None
        if audio is not None:
            data = audio.file.read(MAX_INPUT_BYTES + 1)
            try:
                samples = decode_input_wav(data)
            except AudioError:
                raise HTTPException(status_code=400, detail="bad_audio") from None
        elif mode == "frage":
            raise HTTPException(status_code=400, detail="audio_required")

        if not limiter.allow(device):
            raise HTTPException(status_code=429, detail="rate_limited")
        with busy_lock:
            if device in busy:
                raise HTTPException(status_code=429, detail="busy")
            busy.add(device)
        try:
            started = time.monotonic()
            result: TurnResult = brain.handle(mode, samples, state)
            wav = fixed_audio.get(result.fixed) if result.fixed else None
            if wav is None:
                wav = brain.speak(result)
            turn_id = store.put(device, wav)
            # Nur Dauer und Art – nie Transkript, Antworttext oder Audio.
            log.info("turn mode=%s kind=%s %.1fs", mode, result.kind, time.monotonic() - started)
        except AudioError:
            raise HTTPException(status_code=500, detail="tts_failed") from None
        finally:
            with busy_lock:
                busy.discard(device)

        body = {"turn_id": turn_id, "kind": result.kind, "story_state": result.story_state}
        if diagnostic_text:
            body["text"] = result.speech
        return body

    @app.get("/v1/turn/{turn_id}/audio")
    def turn_audio(turn_id: str, authorization: str | None = Header(None),
                   x_device_id: str | None = Header(None)):
        device = authenticate(authorization, x_device_id)
        wav = store.take(device, turn_id)
        if wav is None:
            raise HTTPException(status_code=404, detail="not_found")
        return Response(content=wav, media_type="audio/wav")

    return app
