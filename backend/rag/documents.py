"""Read PDF / DOCX / TXT files and split the text into clean chunks."""
import io
import re

from docx import Document
from pypdf import PdfReader

ALLOWED_EXTENSIONS = (".pdf", ".docx", ".txt", ".md")


def extract_pages(filename: str, data: bytes) -> list[tuple[int, str]]:
    """Return a list of (page_number, text). Page number is 0 when unknown."""
    name = filename.lower()

    if name.endswith(".pdf"):
        reader = PdfReader(io.BytesIO(data))
        return [(i + 1, page.extract_text() or "") for i, page in enumerate(reader.pages)]

    if name.endswith(".docx"):
        doc = Document(io.BytesIO(data))
        parts = [p.text for p in doc.paragraphs]
        for table in doc.tables:
            for row in table.rows:
                parts.append(" | ".join(cell.text.strip() for cell in row.cells))
        return [(0, "\n".join(parts))]

    if name.endswith((".txt", ".md")):
        return [(0, data.decode("utf-8", errors="ignore"))]

    raise ValueError("Unsupported file type. Please upload PDF, DOCX, TXT or MD.")


_BULLET = re.compile(r"^\s*([-*•]|\d{1,2}[.)])\s+")
_SENTENCE_END = re.compile(r"(?<=[.!?])\s+(?=[A-Z0-9\"'(\[])")


def _normalize(text: str) -> str:
    """PDF text has a line break after every visual line. Join wrapped lines, keep real paragraphs/bullets."""
    text = text.replace("\r", "")
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"-\n(?=[a-z])", "", text)  # re-join words hyphenated at line ends
    out: list[str] = []
    for block in re.split(r"\n{2,}", text):
        lines = [ln.strip() for ln in block.split("\n") if ln.strip()]
        para = ""
        for ln in lines:
            if not para:
                para = ln
            elif _BULLET.match(ln):
                out.append(para)
                para = ln
            else:
                para = f"{para} {ln}"
        if para:
            out.append(para)
    return "\n\n".join(out)


def _split_long(para: str, size: int) -> list[str]:
    """Cut one long paragraph at sentence ends (or spaces) so a sentence is never cut in half."""
    pieces: list[str] = []
    cur = ""
    for sent in _SENTENCE_END.split(para):
        while len(sent) > size:  # a single huge sentence: cut at a space
            cut = sent.rfind(" ", 0, size)
            cut = cut if cut > size // 2 else size
            if cur:
                pieces.append(cur)
                cur = ""
            pieces.append(sent[:cut].strip())
            sent = sent[cut:].strip()
        if cur and len(cur) + len(sent) + 1 > size:
            pieces.append(cur)
            cur = sent
        else:
            cur = f"{cur} {sent}".strip()
    if cur:
        pieces.append(cur)
    return pieces


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> list[str]:
    """Split text into chunks of about `size` characters at paragraph/sentence borders,
    repeating the end of the previous chunk (`overlap`) so context is not lost."""
    text = _normalize(text)
    if not text:
        return []

    units: list[str] = []
    for para in (p.strip() for p in text.split("\n\n")):
        if para:
            units.extend(_split_long(para, size) if len(para) > size else [para])

    chunks: list[str] = []
    current = ""
    for u in units:
        if current and len(current) + len(u) + 2 > size:
            chunks.append(current)
            tail = current[-overlap:]
            tail = tail[tail.find(" ") + 1:] if " " in tail else tail  # start at a word border
            current = f"{tail} {u}" if len(tail) + len(u) + 1 <= size else u
        else:
            current = f"{current}\n\n{u}" if current else u
    if current:
        chunks.append(current)
    return chunks
