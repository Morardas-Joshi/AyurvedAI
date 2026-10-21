"""ChromaDB vector store: saves document chunks and finds the most relevant ones.

Two kinds of documents live here:
  * GLOBAL  - files you put in  backend/rag/data/  (and Knowledge Base entries later). Every visitor's chat uses them.
  * PRIVATE - files a visitor attaches with the paperclip. Only that visitor's chat uses them.
"""
import hashlib
import os
import pathlib
import threading
import uuid

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

from rag.documents import ALLOWED_EXTENSIONS, chunk_text, extract_pages

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_store")
DATA_DIR = pathlib.Path(os.getenv("RAG_DATA_DIR", str(pathlib.Path(__file__).parent / "data")))

_client = chromadb.PersistentClient(path=CHROMA_PATH)
# Chroma's built-in embedding model (all-MiniLM-L6-v2) is free and runs on your computer.
_ef = embedding_functions.DefaultEmbeddingFunction()
_collection = _client.get_or_create_collection(
    name="ayurveda_docs",
    embedding_function=_ef,
    metadata={"hnsw:space": "cosine"},
)
_write_lock = threading.Lock()


def _scope(owner: str) -> dict:
    return {"owner": {"$in": [owner, "global"]}}


def _add_chunks(owner: str, doc_id: str, filename: str, pages: list[tuple[int, str]]) -> int:
    ids, texts, metas = [], [], []
    for page_no, text in pages:
        for chunk in chunk_text(text):
            ids.append(f"{doc_id}-{len(ids)}")
            texts.append(chunk)
            metas.append({"owner": owner, "doc_id": doc_id, "filename": filename, "page": page_no})
    with _write_lock:
        for i in range(0, len(ids), 64):  # small batches
            _collection.add(ids=ids[i:i + 64], documents=texts[i:i + 64], metadatas=metas[i:i + 64])
    return len(ids)


# ---------------- visitor uploads (private) ----------------
def add_document(owner: str, filename: str, pages: list[tuple[int, str]]) -> tuple[str, int]:
    doc_id = uuid.uuid4().hex[:12]
    n = _add_chunks(owner, doc_id, filename, pages)
    if n == 0:
        raise ValueError(
            "No readable text found in this file. If it is a scanned PDF (images only), it needs OCR first."
        )
    return doc_id, n


def list_documents(owner: str) -> list[dict]:
    res = _collection.get(where={"owner": owner}, include=["metadatas"])
    docs: dict[str, dict] = {}
    for meta in res["metadatas"]:
        d = docs.setdefault(meta["doc_id"], {"doc_id": meta["doc_id"], "filename": meta["filename"], "chunks": 0})
        d["chunks"] += 1
    return list(docs.values())


def delete_document(owner: str, doc_id: str) -> None:
    # only the owner's own documents can be removed (global ones are protected)
    with _write_lock:
        _collection.delete(where={"$and": [{"owner": owner}, {"doc_id": doc_id}]})


# ---------------- searching ----------------
def has_documents(owner: str) -> bool:
    res = _collection.get(where=_scope(owner), limit=1, include=[])
    return len(res["ids"]) > 0


def search(owner: str, query: str, k: int = 5) -> list[dict]:
    if _collection.count() == 0:
        return []
    res = _collection.query(
        query_texts=[query],
        n_results=k,
        where=_scope(owner),
        include=["documents", "metadatas", "distances"],
    )
    return [
        {"text": text, "filename": meta["filename"], "page": meta["page"], "distance": dist}
        for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0])
    ]


def search_with_ids(owner: str, query: str, k: int = 5) -> list[dict]:
    """Search like `search`, including stable chunk and document IDs for source tracking."""
    if _collection.count() == 0:
        return []
    res = _collection.query(
        query_texts=[query],
        n_results=k,
        where=_scope(owner),
        include=["documents", "metadatas", "distances"],
    )
    return [
        {
            "id": chunk_id,
            "doc_id": meta["doc_id"],
            "text": text,
            "filename": meta["filename"],
            "page": meta["page"],
            "distance": distance,
        }
        for chunk_id, text, meta, distance in zip(
            res["ids"][0],
            res["documents"][0],
            res["metadatas"][0],
            res["distances"][0],
        )
    ]


def embed_texts(texts: list[str]) -> list[list[float]]:
    """Use Chroma's configured embedding function for related-herb similarity."""
    return _ef(texts)


def stats() -> dict:
    res = _collection.get(where={"owner": "global"}, include=["metadatas"])
    files: dict[str, int] = {}
    for m in res["metadatas"]:
        files[m["filename"]] = files.get(m["filename"], 0) + 1
    return {"total_chunks": _collection.count(), "global_files": files}


# ---------------- global data folder ----------------
def refresh_folder() -> None:
    """Synchronize global RAG documents with the configured data folder."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    res = _collection.get(where={"owner": "global"}, include=["metadatas"])
    known = {
        m["doc_id"]: m["filename"]
        for m in res["metadatas"]
        if m["doc_id"].startswith("file-")
    }
    current: set[str] = set()
    for f in sorted(DATA_DIR.iterdir()):
        if not f.is_file() or f.suffix.lower() not in ALLOWED_EXTENSIONS:
            continue
        data = f.read_bytes()
        doc_id = "file-" + hashlib.sha1(data).hexdigest()[:12]
        current.add(doc_id)
        if known.get(doc_id) == f.name:
            continue
        if doc_id in known:
            with _write_lock:
                _collection.delete(where={"doc_id": doc_id})
        n = _add_chunks("global", doc_id, f.name, extract_pages(f.name, data))
        print(f"[RAG DATA] indexed {f.name}: {n} chunks")
    for old in known.keys() - current:  # file was deleted or changed
        with _write_lock:
            _collection.delete(where={"doc_id": old})
        print(f"[RAG DATA] removed old version {old}")


def ingest_folder() -> None:
    """Load global documents at startup; log errors without preventing the API from starting."""
    try:
        refresh_folder()
    except Exception as e:  # noqa: BLE001
        print("[RAG DATA] ingest failed:", repr(e))


def _startup() -> None:
    """Load the embedding model first (so the first question is fast), then read the data folder."""
    try:
        _ef(["warm up"])
    except Exception as e:  # noqa: BLE001
        print("[RAG] embedding warm-up skipped:", repr(e))
    ingest_folder()


threading.Thread(target=_startup, daemon=True).start()
