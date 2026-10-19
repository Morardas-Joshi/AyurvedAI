"""Free LLM providers with STREAMING: Groq (fast, primary) and Google Gemini (backup)."""
import json
import os
from functools import partial
from typing import Callable, Iterator

import httpx
from dotenv import load_dotenv

load_dotenv()

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "").strip()
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
GEMINI_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_MODELS", "gemini-flash-lite-latest").split(",")
    if m.strip()
]
GROQ_MODEL = os.getenv("GROQ_MODEL", "openai/gpt-oss-120b").strip()
# If GROQ_MODEL is removed by Groq one day, the first of these that your key can use is picked automatically.
GROQ_FALLBACK_MODELS = ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile", "llama-3.1-8b-instant"]
# Groq answers start in well under a second, so it is tried first. Set LLM_PRIMARY=gemini to change.
LLM_PRIMARY = os.getenv("LLM_PRIMARY", "groq").strip().lower()

GROQ_BASE = os.getenv("GROQ_BASE", "https://api.groq.com/openai/v1")
GROQ_URL = f"{GROQ_BASE}/chat/completions"
GEMINI_BASE = os.getenv("GEMINI_BASE", "https://generativelanguage.googleapis.com/v1beta/models")

# One shared connection pool: reuses the HTTPS connection, so every request after the first is faster.
_client = httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0))
_groq_model = {"name": GROQ_MODEL}


class LLMError(Exception):
    pass


def _groq_pick_model() -> str | None:
    """Ask Groq which models this key can use and choose the best one we know."""
    r = _client.get(f"{GROQ_BASE}/models", headers={"Authorization": f"Bearer {GROQ_API_KEY}"})
    if r.status_code != 200:
        return None
    available = {m["id"] for m in r.json().get("data", [])}
    for name in GROQ_FALLBACK_MODELS:
        if name in available:
            return name
    return None


def _groq_payload(system: str, history: list[dict], prompt: str) -> dict:
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": prompt})
    model = _groq_model["name"]
    payload = {"model": model, "messages": messages, "temperature": 0.3, "max_tokens": 1500, "stream": True}
    if model.startswith("openai/gpt-oss"):
        payload["reasoning_effort"] = "low"  # less hidden thinking = faster first word
    return payload


def _groq_stream(system: str, history: list[dict], prompt: str) -> Iterator[str]:
    for attempt in (1, 2):
        with _client.stream(
            "POST", GROQ_URL,
            headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
            json=_groq_payload(system, history, prompt),
        ) as r:
            if r.status_code == 404 and attempt == 1:  # model removed: pick another one and retry once
                better = _groq_pick_model()
                if better and better != _groq_model["name"]:
                    print(f"[LLM] Groq model '{_groq_model['name']}' not available, switching to '{better}'")
                    _groq_model["name"] = better
                    continue
            if r.status_code != 200:
                raise LLMError(f"Groq error {r.status_code}: {r.read().decode(errors='ignore')[:200]}")
            for line in r.iter_lines():
                if not line.startswith("data:"):
                    continue
                payload = line[5:].strip()
                if payload == "[DONE]":
                    return
                try:
                    piece = json.loads(payload)["choices"][0]["delta"].get("content")
                except (ValueError, KeyError, IndexError):
                    continue
                if piece:
                    yield piece
            return


def _gemini_stream(model: str, system: str, history: list[dict], prompt: str) -> Iterator[str]:
    contents = [
        {"role": "user" if m["role"] == "user" else "model", "parts": [{"text": m["content"]}]}
        for m in history
    ]
    contents.append({"role": "user", "parts": [{"text": prompt}]})
    with _client.stream(
        "POST",
        f"{GEMINI_BASE}/{model}:streamGenerateContent?alt=sse",
        headers={"x-goog-api-key": GEMINI_API_KEY, "Content-Type": "application/json"},
        json={
            "systemInstruction": {"parts": [{"text": system}]},
            "contents": contents,
            "generationConfig": {"temperature": 0.3, "maxOutputTokens": 1500},
        },
    ) as r:
        if r.status_code != 200:
            raise LLMError(f"Gemini {model} error {r.status_code}: {r.read().decode(errors='ignore')[:200]}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            try:
                parts = json.loads(line[5:].strip())["candidates"][0]["content"]["parts"]
            except (ValueError, KeyError, IndexError):
                continue
            piece = "".join(p.get("text", "") for p in parts)
            if piece:
                yield piece


def _providers() -> list[tuple[str, Callable[[str, list[dict], str], Iterator[str]]]]:
    groq = [("groq", _groq_stream)] if GROQ_API_KEY else []
    gemini = [(f"gemini:{m}", partial(_gemini_stream, m)) for m in GEMINI_MODELS] if GEMINI_API_KEY else []
    return gemini + groq if LLM_PRIMARY == "gemini" else groq + gemini


def provider_status() -> dict:
    return {
        "groq_key": bool(GROQ_API_KEY), "groq_model": _groq_model["name"],
        "gemini_key": bool(GEMINI_API_KEY), "gemini_models": GEMINI_MODELS, "primary": LLM_PRIMARY,
    }


def stream_generate(system: str, history: list[dict], prompt: str) -> Iterator[tuple[str, str]]:
    """Yield (provider_name, text_piece). If a provider fails before answering, the next one is tried."""
    providers = _providers()
    if not providers:
        raise LLMError("NO_KEY")

    errors: list[str] = []
    for name, fn in providers:
        started = False
        try:
            for piece in fn(system, history, prompt):
                started = True
                yield (f"groq:{_groq_model['name']}" if name == "groq" else name), piece
            if started:
                return
            errors.append(f"{name}: empty answer")
        except (LLMError, httpx.HTTPError) as e:
            if started:  # failed half-way: cannot silently switch provider
                raise LLMError(f"{name} stopped in the middle of the answer: {e}")
            print(f"[LLM FALLBACK] {name} failed -> {e}")
            errors.append(str(e) or repr(e))
    raise LLMError(" | ".join(errors))


def generate(system: str, history: list[dict], prompt: str) -> tuple[str, str]:
    """Non-streaming helper: returns (full_answer, provider_name)."""
    provider, parts = "", []
    for provider, piece in stream_generate(system, history, prompt):
        parts.append(piece)
    return "".join(parts).strip(), provider
