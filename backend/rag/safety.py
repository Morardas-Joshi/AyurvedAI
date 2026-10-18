"""Safety rules: emergency detection and the system prompt."""
import re

EMERGENCY_PATTERNS = [
    r"chest pain", r"heart attack", r"can('|no)?t breathe", r"cannot breathe",
    r"difficulty breathing", r"short(ness)? of breath", r"stroke", r"unconscious",
    r"not breathing", r"severe bleeding", r"bleeding heavily", r"suicid", r"kill myself",
    r"end my life", r"want to die", r"overdose", r"poison", r"seizure", r"snake ?bite",
    r"anaphyla", r"choking",
]
_EMERGENCY_RE = re.compile("|".join(EMERGENCY_PATTERNS), re.IGNORECASE)

EMERGENCY_REPLY = (
    "**This sounds like it could be a medical emergency.**\n\n"
    "Please do not wait for an AI answer. Call **112** (India emergency number) or **108** "
    "(ambulance) right now, or go to the nearest hospital.\n\n"
    "If you are having thoughts of harming yourself, please reach out to someone you trust "
    "or a local helpline immediately.\n\n"
    "AyurvedAI only provides educational information and cannot handle emergencies."
)


def is_emergency(text: str) -> bool:
    return bool(_EMERGENCY_RE.search(text))


SYSTEM_PROMPT = """You are AyurvedAI, a friendly assistant that shares EDUCATIONAL information about Ayurveda: herbs, classical formulations, doshas, diet (ahara), daily routine (dinacharya), seasonal routine (ritucharya), yoga and lifestyle.

Rules you must always follow:
1. You do NOT diagnose diseases, predict diseases, or prescribe treatment or personal doses. If asked, politely explain you cannot, share general educational information instead, and suggest consulting a qualified Ayurvedic doctor (BAMS) or physician.
2. Mention important precautions where relevant (pregnancy, children, chronic illness, medicine interactions, allergies).
3. Never promise cures or guaranteed results.
4. Only answer questions about Ayurveda, herbs, wellness, diet and lifestyle. For unrelated topics, politely say you can only help with Ayurvedic topics.
5. Reply in the same language the user writes in (English, Hindi, Gujarati, etc.).
6. Keep answers clear and well organised: a short intro, then short headed sections or bullet points (e.g. Overview, Traditional uses, How it is commonly used, Precautions). Keep it under about 300 words unless the user asks for more detail.
7. Do not invent references, book names or verses. If you are not sure, say so.
"""


def build_prompt_with_documents(question: str, hits: list[dict]) -> str:
    blocks = []
    for i, h in enumerate(hits, start=1):
        page = f", page {h['page']}" if h["page"] else ""
        blocks.append(f"[{i}] (from {h['filename']}{page})\n{h['text']}")
    context = "\n\n".join(blocks)
    return (
        "The user uploaded documents. Use the document excerpts below as your PRIMARY source.\n"
        "- Base your answer on the excerpts and cite them like [1], [2] after the sentences they support.\n"
        "- If the excerpts only partly answer the question, answer that part from the excerpts, then add a "
        "clearly separated line starting with 'Additional general knowledge:' for the rest.\n"
        "- Do not claim the documents say something they do not say.\n\n"
        f"DOCUMENT EXCERPTS:\n{context}\n\n"
        f"QUESTION: {question}"
    )


def build_prompt_general(question: str, has_documents: bool) -> str:
    note = (
        "The user's uploaded documents did not contain relevant information for this question, so answer "
        "from general Ayurvedic knowledge and start with one short line saying it was not found in their documents.\n\n"
        if has_documents
        else ""
    )
    return f"{note}QUESTION: {question}"