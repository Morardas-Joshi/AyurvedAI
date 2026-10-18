"""AI chat API: answers from uploaded documents first, otherwise from general Ayurvedic knowledge."""
import os

from fastapi import APIRouter, File, Header, HTTPException, UploadFile
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


@router.post("")
def chat(req: ChatRequest, x_user_id: str = Header(default="guest")):
    owner = _owner(x_user_id)
    question = req.message.strip()

    if is_emergency(question):
        return {"answer": EMERGENCY_REPLY, "mode": "emergency", "sources": [], "provider": "rules"}

    # keep the last few turns; Gemini wants the conversation to start with the user
    history = [m.model_dump() for m in req.history[-6:] if m.role in ("user", "assistant")]
    while history and history[0]["role"] != "user":
        history.pop(0)

    # short follow-ups like "what about side effects?" are searched together with the previous question
    search_query = question
    if len(question.split()) < 6:
        prev = [m["content"] for m in history if m["role"] == "user"]
        if prev:
            search_query = f"{prev[-1]} {question}"

    try:
        hits = store.search(owner, search_query, k=5)
    except Exception as e:
        print("SEARCH ERROR:", repr(e))
        hits = []
    relevant = [h for h in hits if h["distance"] <= MAX_DISTANCE][:4]
    has_docs = bool(store.list_documents(owner)) if not relevant else True

    if relevant:
        prompt = build_prompt_with_documents(question, relevant)
        mode = "documents"
    else:
        prompt = build_prompt_general(question, has_docs)
        mode = "general"

    try:
        answer, provider = llm.generate(SYSTEM_PROMPT, history, prompt)
    except llm.LLMError as e:
        if str(e) == "NO_KEY":
            raise HTTPException(503, "AI is not configured yet. Add GEMINI_API_KEY to backend/.env and restart the server.")
        raise HTTPException(502, f"The AI service is busy or unavailable right now. Please try again in a minute. ({e})"[:400])
    except Exception:
        raise HTTPException(502, "Could not reach the AI service. Check your internet connection.")

    sources = []
    if mode == "documents":
        sources = [
            {"id": i, "filename": h["filename"], "page": h["page"], "snippet": h["text"][:300]}
            for i, h in enumerate(relevant, start=1)
        ]
    return {"answer": answer, "mode": mode, "sources": sources, "provider": provider}


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
    except Exception as e:
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