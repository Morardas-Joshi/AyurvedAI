"""AI chat API: answers from uploaded documents first, otherwise from general Ayurvedic knowledge.

/api/chat/stream  -> streams the answer word by word (fast, used by the website)
/api/chat         -> returns the full answer at once (simple clients / testing)
"""
import json
import time
import os
from dataclasses import dataclass, field

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from rag import llm, store
from rag.documents import ALLOWED_EXTENSIONS, extract_pages
from rag.safety import (
    EMERGENCY_REPLY,
    SYSTEM_PROMPT,
    build_prompt_general,
    build_prompt_with_documents,
    is_emergency,
)

router = APIRouter(prefix="/api/chat", tags=["chat"])

# Lower distance = more similar. Increase it (e.g. 0.7) to use documents more often.
MAX_DISTANCE = float(os.getenv("MAX_DISTANCE", "0.6"))
MAX_UPLOAD_MB = 15


def _owner(x_user_id: str) -> str:
    # TEMPORARY identity from the frontend. Will be replaced by the JWT user id later.
    return (x_user_id or "guest").strip()[:100] or "guest"


class Msg(BaseModel):
    role: str
    content: str


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[Msg] = []


@dataclass
class Prepared:
    mode: str = "general"
    prompt: str = ""
    history: list = field(default_factory=list)
    sources: list = field(default_factory=list)
    canned: str | None = None  # ready-made answer (emergency) that skips the AI


def _prepare(req: ChatRequest, owner: str) -> Prepared:
    question = req.message.strip()

    if is_emergency(question):
        return Prepared(mode="emergency", canned=EMERGENCY_REPLY)

    # keep the last few turns; the conversation must start with the user
    history = [m.model_dump() for m in req.history[-6:] if m.role in ("user", "assistant")]
    while history and history[0]["role"] != "user":
        history.pop(0)

    relevant: list[dict] = []
    has_docs = False
    try:
        has_docs = store.has_documents(owner)
        if has_docs:  # no documents -> skip the search completely (faster)
            search_query = question
            if len(question.split()) < 6:  # short follow-up: search with the previous question too
                prev = [m["content"] for m in history if m["role"] == "user"]
                if prev:
                    search_query = f"{prev[-1]} {question}"
            hits = store.search(owner, search_query, k=5)
            relevant = [h for h in hits if h["distance"] <= MAX_DISTANCE][:4]
    except Exception as e:  # noqa: BLE001
        print("SEARCH ERROR:", repr(e))

    if relevant:
        sources = [
            {"id": i, "filename": h["filename"], "page": h["page"], "snippet": h["text"][:300]}
            for i, h in enumerate(relevant, start=1)
        ]
        return Prepared("documents", build_prompt_with_documents(question, relevant), history, sources)
    return Prepared("general", build_prompt_general(question, has_docs), history, [])


def _friendly(e: Exception) -> str:
    if str(e) == "NO_KEY":
        return "AI is not configured yet. Add GROQ_API_KEY or GEMINI_API_KEY to backend/.env and restart the server."
    if isinstance(e, llm.LLMError):
        return f"The AI service is busy or unavailable right now. Please try again in a minute. ({e})"[:400]
    return "Could not reach the AI service. Check your internet connection."


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


@router.post("/stream")
def chat_stream(req: ChatRequest, x_user_id: str = Header(default="guest")):
    t0 = time.perf_counter()
    prep = _prepare(req, _owner(x_user_id))
    print(f"[TIMING] prepare (search) = {time.perf_counter() - t0:.2f}s  mode={prep.mode}")

    def events():
        yield _sse({"type": "meta", "mode": prep.mode, "sources": prep.sources})
        if prep.canned is not None:
            yield _sse({"type": "delta", "text": prep.canned})
            yield _sse({"type": "done", "provider": "rules"})
            return
        provider, first = "", True
        try:
            for provider, piece in llm.stream_generate(SYSTEM_PROMPT, prep.history, prep.prompt):
                if first:
                    print(f"[TIMING] first word = {time.perf_counter() - t0:.2f}s  provider={provider}")
                    first = False
                yield _sse({"type": "delta", "text": piece})
        except Exception as e:  # noqa: BLE001
            print("LLM ERROR:", repr(e))
            yield _sse({"type": "error", "message": _friendly(e)})
            return
        print(f"[TIMING] total = {time.perf_counter() - t0:.2f}s")
        yield _sse({"type": "done", "provider": provider})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("")
def chat(req: ChatRequest, x_user_id: str = Header(default="guest")):
    prep = _prepare(req, _owner(x_user_id))
    if prep.canned is not None:
        return {"answer": prep.canned, "mode": prep.mode, "sources": [], "provider": "rules"}
    try:
        answer, provider = llm.generate(SYSTEM_PROMPT, prep.history, prep.prompt)
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503 if str(e) == "NO_KEY" else 502, _friendly(e))
    return {"answer": answer, "mode": prep.mode, "sources": prep.sources, "provider": provider}


@router.post("/documents")
async def upload_document(file: UploadFile = File(...), x_user_id: str = Header(default="guest")):
    owner = _owner(x_user_id)
    name = file.filename or "document"
    if not name.lower().endswith(ALLOWED_EXTENSIONS):
        raise HTTPException(400, "Please upload a PDF, DOCX, TXT or MD file.")
    data = await file.read()
    if len(data) > MAX_UPLOAD_MB * 1024 * 1024:
        raise HTTPException(400, f"File is too large (max {MAX_UPLOAD_MB} MB).")
    try:
        pages = extract_pages(name, data)
        doc_id, chunks = store.add_document(owner, name, pages)
    except ValueError as e:
        raise HTTPException(400, str(e))
    except Exception as e:  # noqa: BLE001
        print("UPLOAD ERROR:", repr(e))
        raise HTTPException(400, f"Could not process this file: {str(e)[:150]}")
    return {"doc_id": doc_id, "filename": name, "chunks": chunks}


@router.get("/documents")
def my_documents(x_user_id: str = Header(default="guest")):
    return {"documents": store.list_documents(_owner(x_user_id))}


@router.delete("/documents/{doc_id}")
def remove_document(doc_id: str, x_user_id: str = Header(default="guest")):
    store.delete_document(_owner(x_user_id), doc_id)
    return {"status": "success"}
