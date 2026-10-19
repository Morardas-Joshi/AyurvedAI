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
# "-latest" aliases always point to the current free Flash model.
GEMINI_MODELS = [
    m.strip()
    for m in os.getenv("GEMINI_MODELS", "gemini-flash-latest,gemini-flash-lite-latest").split(",")
    if m.strip()
]
GROQ_MODEL = os.getenv("GROQ_MODEL", "llama-3.3-70b-versatile")
# Groq answers start in well under a second, so it is tried first. Set LLM_PRIMARY=gemini to change.
LLM_PRIMARY = os.getenv("LLM_PRIMARY", "groq").strip().lower()

GROQ_URL = os.getenv("GROQ_URL", "https://api.groq.com/openai/v1/chat/completions")
GEMINI_BASE = os.getenv("GEMINI_BASE", "https://generativelanguage.googleapis.com/v1beta/models")

# One shared connection pool: reuses the HTTPS connection, so every request after the first is faster.
_client = httpx.Client(timeout=httpx.Timeout(60.0, connect=10.0))


class LLMError(Exception):
    pass


def _groq_stream(system: str, history: list[dict], prompt: str) -> Iterator[str]:
    messages = [{"role": "system", "content": system}]
    messages += [{"role": m["role"], "content": m["content"]} for m in history]
    messages.append({"role": "user", "content": prompt})
    with _client.stream(
        "POST",
        GROQ_URL,
        headers={"Authorization": f"Bearer {GROQ_API_KEY}"},
                json={
            "model": GROQ_MODEL, "messages": messages, "temperature": 0.3,
            "max_tokens": 1500, "stream": True,
            **({"reasoning_effort": "low"} if GROQ_MODEL.startswith("openai/gpt-oss") else {}),
        },
    ) as r:
        if r.status_code != 200:
            raise LLMError(f"Groq error {r.status_code}: {r.read().decode(errors='ignore')[:200]}")
        for line in r.iter_lines():
            if not line.startswith("data:"):
                continue
            payload = line[5:].strip()
            if payload == "[DONE]":
                break
            try:
                piece = json.loads(payload)["choices"][0]["delta"].get("content")
            except (ValueError, KeyError, IndexError):
                continue
            if piece:
                yield piece


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
    groq = [(f"groq:{GROQ_MODEL}", _groq_stream)] if GROQ_API_KEY else []
    gemini = [(f"gemini:{m}", partial(_gemini_stream, m)) for m in GEMINI_MODELS] if GEMINI_API_KEY else []
    return gemini + groq if LLM_PRIMARY == "gemini" else groq + gemini


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
                yield name, piece
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
