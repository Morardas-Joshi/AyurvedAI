"""ChromaDB vector store: saves document chunks and finds the most relevant ones."""
import os
import threading
import uuid

import chromadb
from chromadb.utils import embedding_functions
from dotenv import load_dotenv

from rag.documents import chunk_text

load_dotenv()

CHROMA_PATH = os.getenv("CHROMA_PATH", "./chroma_store")

_client = chromadb.PersistentClient(path=CHROMA_PATH)
# Chroma's built-in embedding model (all-MiniLM-L6-v2) is free and runs locally.
_ef = embedding_functions.DefaultEmbeddingFunction()
_collection = _client.get_or_create_collection(
    name="ayurveda_docs",
    embedding_function=_ef,
    metadata={"hnsw:space": "cosine"},
)


def _warm_up() -> None:
    """Load the embedding model in the background so the first real question is not slow."""
    try:
        _ef(["warm up"])
    except Exception as e:  # noqa: BLE001
        print("Embedding warm-up skipped:", repr(e))


threading.Thread(target=_warm_up, daemon=True).start()


def has_documents(owner: str) -> bool:
    res = _collection.get(where={"owner": {"$in": [owner, "global"]}}, limit=1, include=[])
    return len(res["ids"]) > 0


def add_document(owner: str, filename: str, pages: list[tuple[int, str]]) -> tuple[str, int]:
    doc_id = uuid.uuid4().hex[:12]
    ids, texts, metas = [], [], []
    n = 0
    for page_no, text in pages:
        for chunk in chunk_text(text):
            ids.append(f"{doc_id}-{n}")
            texts.append(chunk)
            metas.append({"owner": owner, "doc_id": doc_id, "filename": filename, "page": page_no})
            n += 1
    if n == 0:
        raise ValueError(
            "No readable text found in this file. If it is a scanned PDF (images only), "
            "it needs OCR first."
        )
    for i in range(0, n, 64):  # add in small batches
        _collection.add(ids=ids[i:i + 64], documents=texts[i:i + 64], metadatas=metas[i:i + 64])
    return doc_id, n


def search(owner: str, query: str, k: int = 5) -> list[dict]:
    if _collection.count() == 0:
        return []
    res = _collection.query(
        query_texts=[query],
        n_results=k,
        where={"owner": {"$in": [owner, "global"]}},
        include=["documents", "metadatas", "distances"],
    )
    hits = []
    for text, meta, dist in zip(res["documents"][0], res["metadatas"][0], res["distances"][0]):
        hits.append({
            "text": text,
            "filename": meta["filename"],
            "page": meta["page"],
            "distance": dist,
        })
    return hits


def list_documents(owner: str) -> list[dict]:
    res = _collection.get(where={"owner": owner}, include=["metadatas"])
    docs: dict[str, dict] = {}
    for meta in res["metadatas"]:
        d = docs.setdefault(meta["doc_id"], {"doc_id": meta["doc_id"], "filename": meta["filename"], "chunks": 0})
        d["chunks"] += 1
    return list(docs.values())


def delete_document(owner: str, doc_id: str) -> None:
    _collection.delete(where={"$and": [{"owner": owner}, {"doc_id": doc_id}]})
