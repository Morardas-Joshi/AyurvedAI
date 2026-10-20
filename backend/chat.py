"""AI chat API: answers from uploaded documents first, otherwise from general Ayurvedic knowledge.

/api/chat/stream  -> streams the answer word by word (fast, used by the website)
/api/chat         -> returns the full answer at once (simple clients / testing)
"""
import json
import os
import re
import time
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
from safety_service import assess, check_answer, get_disclaimer, log_event, safe_system_prompt

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
    safety: dict | None = None


_STOP = set(
    "a an the is are was were be been being of for to in on at by with from and or but not no do does did can could "
    "should would will may might shall what which who whom whose when where why how this that these those it its i me "
    "my we our you your they their them he she his her as about into over under than then so if any some more most "
    "very also tell give explain describe list show please many much there here have has had get got let know".split()
)
# words that appear in almost every chunk, so they cannot prove a chunk is about the question
_GENERIC = set(
    "benefit benefits use uses used using dose dosage doses side effect effects herb herbs ayurveda ayurvedic "
    "medicine medicines medicinal remedy remedies treatment information info property properties safe safety "
    "good bad best help helps concern concerns problem problems reported report cases case".split()
)
STRICT_DISTANCE = float(os.getenv("STRICT_DISTANCE", "0.35"))  # this close = relevant even without a shared word


def _key_terms(text: str) -> list[str]:
    words = re.findall(r"\w+", text.lower())
    return [w for w in words if len(w) >= 3 and w not in _STOP and w not in _GENERIC]


def _relevant(hit: dict, terms: list[str]) -> bool:
    """A chunk counts only if it is close in meaning AND (shares a key word with the question OR is very close)."""
    if hit["distance"] > MAX_DISTANCE:
        return False
    if hit["distance"] <= STRICT_DISTANCE:
        return True
    low = hit["text"].lower()
    return any(t[:6] in low for t in terms)  # t[:6] lets 'endangered' match 'endangered/endanger'


_SMALLTALK = re.compile(
    r"^\s*((hi+|hello+|hey+)( there)?|namaste|namaskar|thanks?( you)?|thank u|ok(ay)?|good (morning|evening|night|afternoon)|bye)\W*$",
    re.IGNORECASE,
)


def _prepare(req: ChatRequest, owner: str) -> Prepared:
    question = req.message.strip()
    risk = assess(question, "chat")
    safety = risk.to_dict()
    safety["disclaimer"] = get_disclaimer("chat")

    if risk.level == "emergency" or is_emergency(question):
        safety["level"] = "emergency"
        safety["flags"] = sorted(set(safety["flags"] + ["emergency"]))
        return Prepared(mode="emergency", canned=EMERGENCY_REPLY, safety=safety)
    if risk.block_answer:
        return Prepared(mode="general", canned=" ".join(risk.messages), safety=safety)

    # keep the last few turns; the conversation must start with the user
    history = [m.model_dump() for m in req.history[-6:] if m.role in ("user", "assistant")]
    while history and history[0]["role"] != "user":
        history.pop(0)

    relevant: list[dict] = []
    has_docs = False
    try:
        has_docs = store.has_documents(owner)
        if has_docs and not _SMALLTALK.match(question):  # greetings and no documents -> skip the search completely (faster)
            search_query = question
            if len(question.split()) < 6:  # short follow-up: search with the previous question too
                prev = [m["content"] for m in history if m["role"] == "user"]
                if prev:
                    search_query = f"{prev[-1]} {question}"
            hits = store.search(owner, search_query, k=5)
            terms = _key_terms(question) or _key_terms(search_query)  # own words first; a bare follow-up borrows the previous question's
            relevant = [h for h in hits if _relevant(h, terms)][:4]
    except Exception as e:  # noqa: BLE001
        print("SEARCH ERROR:", repr(e))

    if relevant:
        sources = [
            {"id": i, "filename": h["filename"], "page": h["page"], "snippet": h["text"][:300]}
            for i, h in enumerate(relevant, start=1)
        ]
        return Prepared("documents", build_prompt_with_documents(question, relevant), history, sources, safety=safety)
    return Prepared("general", build_prompt_general(question, has_docs), history, [], safety=safety)


def _check_generated_answer(answer: str, safety: dict | None, user_id: str) -> tuple[str, dict]:
    output = check_answer(answer, "chat")
    combined = dict(safety or {})
    flags = sorted(set(combined.get("flags", []) + output.flags))
    messages = list(dict.fromkeys(combined.get("messages", []) + output.messages))
    if output.level == "warning" or combined.get("level") == "warning":
        combined["level"] = "warning"
    else:
        combined["level"] = combined.get("level", "info")
    combined.update({
        "flags": flags,
        "messages": messages,
        "show_professional_cta": bool(combined.get("show_professional_cta") or output.show_professional_cta),
        "disclaimer": get_disclaimer("chat"),
    })
    if flags:
        log_event("chat", combined["level"], flags, user_id)
    return output.sanitized_text, combined


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
    print(f"[TIMING] search = {time.perf_counter() - t0:.2f}s  mode={prep.mode}  sources={len(prep.sources)}")

    def events():
        yield _sse({"type": "meta", "mode": prep.mode, "sources": prep.sources, "safety": prep.safety})
        if prep.canned is not None:
            if prep.safety and prep.safety.get("flags"):
                log_event("chat", prep.safety.get("level", "warning"), prep.safety["flags"], _owner(x_user_id))
            yield _sse({"type": "delta", "text": prep.canned})
            yield _sse({"type": "done", "provider": "rules", "safety": prep.safety})
            return
        provider, first = "", True
        answer_parts = []
        try:
            for provider, piece in llm.stream_generate(
                SYSTEM_PROMPT + "\n\n" + safe_system_prompt("chat"),
                prep.history,
                prep.prompt,
            ):
                if first:
                    print(f"[TIMING] first word = {time.perf_counter() - t0:.2f}s  provider={provider}")
                    first = False
                answer_parts.append(piece)
        except Exception as e:  # noqa: BLE001
            print("LLM ERROR:", repr(e))
            yield _sse({"type": "error", "message": _friendly(e)})
            return
        answer, safety = _check_generated_answer("".join(answer_parts), prep.safety, _owner(x_user_id))
        yield _sse({"type": "delta", "text": answer})
        print(f"[TIMING] total = {time.perf_counter() - t0:.2f}s")
        yield _sse({"type": "done", "provider": provider, "safety": safety})

    return StreamingResponse(
        events(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.get("/health")
def health():
    """Open http://127.0.0.1:8000/api/chat/health to see if everything is set up correctly."""
    try:
        rag = store.stats()
    except Exception as e:  # noqa: BLE001
        rag = {"error": repr(e)}
    return {"llm": llm.provider_status(), "rag": rag, "max_distance": MAX_DISTANCE}


@router.post("")
def chat(req: ChatRequest, x_user_id: str = Header(default="guest")):
    prep = _prepare(req, _owner(x_user_id))
    if prep.canned is not None:
        if prep.safety and prep.safety.get("flags"):
            log_event("chat", prep.safety.get("level", "warning"), prep.safety["flags"], _owner(x_user_id))
        return {"answer": prep.canned, "mode": prep.mode, "sources": [], "provider": "rules", "safety": prep.safety}
    try:
        answer, provider = llm.generate(
            SYSTEM_PROMPT + "\n\n" + safe_system_prompt("chat"),
            prep.history,
            prep.prompt,
        )
    except Exception as e:  # noqa: BLE001
        raise HTTPException(503 if str(e) == "NO_KEY" else 502, _friendly(e))
    answer, safety = _check_generated_answer(answer, prep.safety, _owner(x_user_id))
    return {"answer": answer, "mode": prep.mode, "sources": prep.sources, "provider": provider, "safety": safety}


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
