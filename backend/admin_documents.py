import re
import shutil
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, File, Form, HTTPException, UploadFile
from pydantic import BaseModel

from rag import store
from rag.documents import ALLOWED_EXTENSIONS

router = APIRouter(prefix="/api/admin/documents", tags=["admin-documents"])

DATA_DIR = store.DATA_DIR
DATA_DIR.mkdir(parents=True, exist_ok=True)


class RenameBody(BaseModel):
    new_name: str


def _clean(name: str) -> str:
    name = re.sub(r'[\\/:*?"<>|]', "", name or "").strip()
    return name.rstrip(". ")


def _resolve(filename: str) -> Path:
    path = (DATA_DIR / filename).resolve()
    if path.parent != DATA_DIR.resolve() or not path.is_file():
        raise HTTPException(status_code=404, detail="File not found.")
    if path.suffix.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=404, detail="File not found.")
    return path


def _to_dict(path: Path) -> dict:
    stat = path.stat()
    return {
        "filename": path.name,
        "name": path.stem,
        "extension": path.suffix,
        "size": stat.st_size,
        "uploaded_at": datetime.fromtimestamp(stat.st_mtime).isoformat(),
    }


def _refresh_documents() -> None:
    store.refresh_folder()


@router.get("")
def list_documents():
    files = [p for p in DATA_DIR.iterdir() if p.is_file() and p.suffix.lower() in ALLOWED_EXTENSIONS]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    return {"documents": [_to_dict(p) for p in files]}


@router.post("")
async def upload_document(file: UploadFile = File(...), name: str = Form("")):
    original = Path(file.filename or "")
    ext = original.suffix
    if ext.lower() not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="Please upload a PDF, DOCX, TXT or MD file.")

    stem = _clean(name) if name.strip() else _clean(original.stem)
    if ext and stem.lower().endswith(ext.lower()):
        stem = stem[: -len(ext)]
    if not stem:
        raise HTTPException(status_code=400, detail="Invalid file name.")

    target = DATA_DIR / f"{stem}{ext}"
    try:
        with target.open("xb") as buffer:
            shutil.copyfileobj(file.file, buffer)
    except FileExistsError:
        raise HTTPException(status_code=409, detail="A file with this name already exists.")

    _refresh_documents()
    return {"message": "Document added successfully.", "document": _to_dict(target)}


@router.put("/{filename}")
def rename_document(filename: str, body: RenameBody):
    path = _resolve(filename)
    stem = _clean(body.new_name)
    if stem.lower().endswith(path.suffix.lower()) and path.suffix:
        stem = stem[: -len(path.suffix)]
    if not stem:
        raise HTTPException(status_code=400, detail="Invalid file name.")

    target = DATA_DIR / f"{stem}{path.suffix}"
    if target.exists() and target != path:
        raise HTTPException(status_code=409, detail="A file with this name already exists.")

    path.rename(target)
    _refresh_documents()
    return {"message": "Document renamed successfully.", "document": _to_dict(target)}


@router.delete("/{filename}")
def delete_document(filename: str):
    _resolve(filename).unlink()
    _refresh_documents()
    return {"message": "Document deleted successfully."}
