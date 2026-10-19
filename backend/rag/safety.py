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
5. Reply in the same language and script the user writes in (English, Hindi, Gujarati, etc.).
6. Be concise: at most about 180 words, unless the user asks for more detail. Start with a 1-2 sentence answer, then at most 3 short sections with 2-4 bullets each.
7. FORMAT STRICTLY: section titles on their own line starting with '## '. Bullets start with '- '. Use **bold** only for key terms. Never use single asterisks for italics, never nest bold inside italics or the reverse, no tables, no horizontal lines.
8. Do not invent references, book names or verses. If you are not sure, say so.
9. Cite document excerpts only as [1], [2] with plain square brackets, never with any other bracket style.
10. Never give a personal dose, amount or schedule for the user. You may repeat reference dose ranges only when they appear in the document excerpts, and say they are not a recommendation.
"""


def build_prompt_with_documents(question: str, hits: list[dict]) -> str:
    blocks = []
    for i, h in enumerate(hits, start=1):
        page = f", page {h['page']}" if h["page"] else ""
        blocks.append(f"[{i}] (from {h['filename']}{page})\n{h['text']}")
    context = "\n\n".join(blocks)
    return (
        "Below are excerpts from the AyurvedAI reference documents (or the user's own uploaded files). "
        "Use them as your PRIMARY source.\n"
        "- Base your answer on the excerpts and cite them like [1], [2] after the sentences they support.\n"
        "- If the excerpts only partly answer the question, answer that part from the excerpts, then add a "
        "clearly separated line starting with 'Additional general knowledge:' for the rest.\n"
        "- Do not claim the documents say something they do not say.\n\n"
        f"DOCUMENT EXCERPTS:\n{context}\n\n"
        f"QUESTION: {question}"
    )


def build_prompt_general(question: str, has_documents: bool) -> str:
    note = (
        "No reference document matched this question. Answer from general Ayurvedic knowledge. "
        "If it is a real Ayurveda or health question, begin with one short line: "
        "'This is general Ayurvedic knowledge (not found in the reference documents).' "
        "For greetings or small talk, just reply naturally without that line.\n\n"
        if has_documents
        else ""
    )
    return f"{note}QUESTION: {question}"
