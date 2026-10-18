"""Read PDF / DOCX / TXT files and split the text into chunks."""
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


def chunk_text(text: str, size: int = 900, overlap: int = 150) -> list[str]:
    """Split text into overlapping chunks, keeping paragraphs together when possible."""
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text).strip()
    if not text:
        return []

    chunks: list[str] = []
    current = ""
    for para in (p.strip() for p in text.split("\n\n")):
        if not para:
            continue
        # a single very long paragraph is cut into pieces
        while len(para) > size:
            if current:
                chunks.append(current)
                current = ""
            chunks.append(para[:size])
            para = para[size - overlap:]
        if len(current) + len(para) + 2 <= size:
            current = f"{current}\n\n{para}" if current else para
        else:
            if current:
                chunks.append(current)
            tail = current[-overlap:] if current else ""
            current = f"{tail}\n\n{para}" if tail else para
    if current:
        chunks.append(current)
    return chunks