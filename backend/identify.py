"""Herb image identification.

Photo  ->  plant name (Pl@ntNet, free; Gemini vision as backup)  ->  Ayurvedic answer from your documents first,
then general knowledge, streamed word by word exactly like the normal chat.

Photos are processed in memory and are NOT saved anywhere.

  POST /api/identify/stream   photo + optional question  -> streamed answer (used by the website)
  POST /api/identify          photo only                 -> identification JSON (testing / future pages)
"""
import base64
import io
import json
import os
import time
from collections import defaultdict, deque

import httpx
from dotenv import load_dotenv
from fastapi import APIRouter, File, Form, Header, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from PIL import Image, ImageOps, UnidentifiedImageError

import chat
from rag import llm, store
from rag.safety import (
    EMERGENCY_REPLY,
    SYSTEM_PROMPT,
    build_prompt_general,
    build_prompt_with_documents,
    is_emergency,
)

load_dotenv()

router = APIRouter(prefix="/api/identify", tags=["identify"])

PLANTNET_API_KEY = os.getenv("PLANTNET_API_KEY", "").strip()
PLANTNET_URL = os.getenv("PLANTNET_URL", "https://my-api.plantnet.org/v2/identify/all")
MIN_CONFIDENCE = float(os.getenv("IDENTIFY_MIN_CONFIDENCE", "0.15"))  # below this we do not guess
SURE_CONFIDENCE = 0.6
MAX_IMAGE_MB = 8
PER_USER_PER_HOUR = int(os.getenv("IDENTIFY_PER_USER_PER_HOUR", "15"))
DAILY_CAP = int(os.getenv("IDENTIFY_DAILY_CAP", "450"))  # Pl@ntNet free plan = 500 per day

_client = httpx.Client(timeout=httpx.Timeout(30.0, connect=10.0))

# Latin name -> (Ayurvedic / Sanskrit name, toxic?)   Add your own lines here any time.
AYURVEDIC: dict[str, tuple[str, bool]] = {
    "withania somnifera": ("Ashwagandha", False),
    "azadirachta indica": ("Neem (Nimba)", False),
    "curcuma longa": ("Turmeric (Haridra)", False),
    "ocimum tenuiflorum": ("Tulsi (Holy basil)", False),
    "ocimum sanctum": ("Tulsi (Holy basil)", False),
    "phyllanthus emblica": ("Amla (Amalaki)", False),
    "emblica officinalis": ("Amla (Amalaki)", False),
    "bacopa monnieri": ("Brahmi", False),
    "centella asiatica": ("Gotu kola (Mandukaparni)", False),
    "tinospora cordifolia": ("Guduchi (Giloy)", False),
    "asparagus racemosus": ("Shatavari", False),
    "zingiber officinale": ("Ginger (Shunthi / Ardraka)", False),
    "terminalia chebula": ("Haritaki", False),
    "terminalia bellirica": ("Bibhitaki (Vibhitaki)", False),
    "terminalia arjuna": ("Arjuna", False),
    "glycyrrhiza glabra": ("Licorice (Yashtimadhu)", False),
    "commiphora wightii": ("Guggul", False),
    "piper longum": ("Long pepper (Pippali)", False),
    "piper nigrum": ("Black pepper (Maricha)", False),
    "aloe vera": ("Aloe vera (Kumari)", False),
    "aloe barbadensis": ("Aloe vera (Kumari)", False),
    "moringa oleifera": ("Moringa (Shigru)", False),
    "trigonella foenum-graecum": ("Fenugreek (Methi)", False),
    "murraya koenigii": ("Curry leaf (Kadi patta)", False),
    "eclipta prostrata": ("Bhringraj", False),
    "eclipta alba": ("Bhringraj", False),
    "andrographis paniculata": ("Kalmegh (Bhunimba)", False),
    "gymnema sylvestre": ("Gudmar (Meshashringi)", False),
    "boerhavia diffusa": ("Punarnava", False),
    "cissus quadrangularis": ("Hadjod (Asthisamhari)", False),
    "tribulus terrestris": ("Gokshura", False),
    "mucuna pruriens": ("Kapikacchu", False),
    "santalum album": ("Sandalwood (Chandana)", False),
    "cinnamomum verum": ("Cinnamon (Dalchini)", False),
    "cinnamomum zeylanicum": ("Cinnamon (Dalchini)", False),
    "nigella sativa": ("Black cumin (Kalonji)", False),
    "coriandrum sativum": ("Coriander (Dhanyaka)", False),
    "cuminum cyminum": ("Cumin (Jeeraka)", False),
    "foeniculum vulgare": ("Fennel (Saunf)", False),
    "vitex negundo": ("Nirgundi", False),
    "aegle marmelos": ("Bilva (Bael)", False),
    "ficus religiosa": ("Ashvattha (Peepal)", False),
    "ficus benghalensis": ("Vata (Banyan)", False),
    "butea monosperma": ("Palasha", False),
    "sida cordifolia": ("Bala", False),
    "rauvolfia serpentina": ("Sarpagandha", False),
    "holarrhena pubescens": ("Kutaja", False),
    "picrorhiza kurroa": ("Kutki (Katuki)", False),
    "evolvulus alsinoides": ("Shankhpushpi", False),
    "clitoria ternatea": ("Aparajita (Butterfly pea)", False),
    "acorus calamus": ("Vacha (Sweet flag)", False),
    "hibiscus rosa-sinensis": ("Japa (Hibiscus)", False),
    "mentha arvensis": ("Pudina (Mint)", False),
    "ricinus communis": ("Castor (Eranda)", True),
    "datura stramonium": ("Dhatura", True),
    "datura metel": ("Dhatura", True),
    "abrus precatorius": ("Gunja (Rosary pea)", True),
    "calotropis gigantea": ("Arka (Madar)", True),
    "calotropis procera": ("Arka (Madar)", True),
    "cascabela thevetia": ("Yellow oleander (Karavira)", True),
    "nerium oleander": ("Oleander (Karavira)", True),
    "strychnos nux-vomica": ("Kupilu (Nux vomica)", True),
}

# ---------- simple protection of the free quota ----------
_user_hits: dict[str, deque] = defaultdict(deque)
_daily = {"day": "", "n": 0}


def _allow(owner: str) -> str | None:
    """Returns None if allowed, otherwise the reason."""
    today = time.strftime("%Y-%m-%d")
    if _daily["day"] != today:
        _daily.update(day=today, n=0)
    if _daily["n"] >= DAILY_CAP:
        return "Today's free photo-identification limit has been reached. Please try again tomorrow, or type the herb's name."
    q = _user_hits[owner]
    now = time.time()
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= PER_USER_PER_HOUR:
        return "You have identified many photos this hour. Please wait a little, or type the herb's name."
    q.append(now)
    _daily["n"] += 1
    return None


class IdentifyError(Exception):
    pass


class NotAPlant(Exception):
    pass


# ---------- image ----------
def _prepare_image(data: bytes) -> bytes:
    if len(data) > MAX_IMAGE_MB * 1024 * 1024:
        raise HTTPException(400, f"Image is too large (max {MAX_IMAGE_MB} MB).")
    try:
        img = Image.open(io.BytesIO(data))
        img = ImageOps.exif_transpose(img).convert("RGB")
    except (UnidentifiedImageError, OSError, Image.DecompressionBombError):
        raise HTTPException(400, "Could not read this image. Please upload a JPG, PNG or WEBP photo.")
    if min(img.size) < 100:
        raise HTTPException(400, "This image is too small. Please use a clearer, larger photo.")
    img.thumbnail((1280, 1280))
    out = io.BytesIO()
    img.save(out, "JPEG", quality=88)
    return out.getvalue()


# ---------- recognisers ----------
def _plantnet(jpeg: bytes) -> list[dict]:
    r = _client.post(
        PLANTNET_URL,
        params={"api-key": PLANTNET_API_KEY, "lang": "en", "nb-results": 3, "include-related-images": "false"},
        files=[("images", ("photo.jpg", jpeg, "image/jpeg"))],
    )
    if r.status_code == 404:
        raise NotAPlant()
    if r.status_code in (401, 403):
        raise IdentifyError("The Pl@ntNet API key is not valid. Check PLANTNET_API_KEY in backend/.env.")
    if r.status_code == 429:
        raise IdentifyError("The free Pl@ntNet daily limit is finished. Please try again tomorrow.")
    if r.status_code != 200:
        raise IdentifyError(f"Pl@ntNet error {r.status_code}")
    out = []
    for item in r.json().get("results", [])[:3]:
        sp = item.get("species", {})
        fam = sp.get("family") or {}
        out.append({
            "scientific": sp.get("scientificNameWithoutAuthor") or sp.get("scientificName", "").strip(),
            "common": list(sp.get("commonNames") or [])[:3],
            "family": fam.get("scientificNameWithoutAuthor") or fam.get("scientificName", ""),
            "score": round(float(item.get("score", 0)), 3),
        })
    return [c for c in out if c["scientific"]]


_GEMINI_PROMPT = (
    "You are a botanist. Identify the plant in this photo. Prefer plants found in India or used in Ayurveda when they "
    "fit. Reply with JSON only: {\"is_plant\": true/false, \"candidates\": [{\"scientific\": \"Latin name\", "
    "\"common\": \"English common name\", \"family\": \"family\", \"confidence\": 0.0-1.0}]} with at most 3 "
    "candidates, best first. Be honest: use a low confidence if the photo is unclear. Never invent a name."
)


def _gemini_vision(jpeg: bytes) -> list[dict]:
    body = {
        "contents": [{"parts": [
            {"inline_data": {"mime_type": "image/jpeg", "data": base64.b64encode(jpeg).decode()}},
            {"text": _GEMINI_PROMPT},
        ]}],
        "generationConfig": {"temperature": 0.1, "responseMimeType": "application/json"},
    }
    last = "no model"
    for model in llm.GEMINI_MODELS:
        r = _client.post(
            f"{llm.GEMINI_BASE}/{model}:generateContent",
            headers={"x-goog-api-key": llm.GEMINI_API_KEY, "Content-Type": "application/json"},
            json=body,
        )
        if r.status_code != 200:
            last = f"Gemini {model} error {r.status_code}"
            continue
        try:
            text = r.json()["candidates"][0]["content"]["parts"][0]["text"]
            data = json.loads(text)
        except (KeyError, IndexError, ValueError):
            last = "Gemini returned an unreadable answer"
            continue
        if not data.get("is_plant", True) or not data.get("candidates"):
            raise NotAPlant()
        out = []
        for c in data["candidates"][:3]:
            sci = str(c.get("scientific", "")).strip()
            if sci:
                conf = min(float(c.get("confidence", 0) or 0), 0.85)  # a language model is never fully sure
                out.append({"scientific": sci, "common": [str(c.get("common", "")).strip()] if c.get("common") else [],
                            "family": str(c.get("family", "")).strip(), "score": round(conf, 3)})
        if out:
            return out
    raise IdentifyError(last)


def identify_image(jpeg: bytes) -> dict:
    """Returns {"provider", "candidates": [...]} or raises NotAPlant / IdentifyError."""
    errors: list[str] = []
    if PLANTNET_API_KEY:
        try:
            return {"provider": "plantnet", "candidates": _plantnet(jpeg)}
        except NotAPlant:
            raise
        except (IdentifyError, httpx.HTTPError) as e:
            print("[IDENTIFY] Pl@ntNet failed ->", e)
            errors.append(str(e) or repr(e))
    if llm.GEMINI_API_KEY:
        try:
            return {"provider": "gemini", "candidates": _gemini_vision(jpeg)}
        except NotAPlant:
            raise
        except (IdentifyError, httpx.HTTPError) as e:
            print("[IDENTIFY] Gemini vision failed ->", e)
            errors.append(str(e) or repr(e))
    if not errors:
        raise IdentifyError(
            "Herb photo identification is not set up yet. Add a free PLANTNET_API_KEY to backend/.env and restart."
        )
    raise IdentifyError(errors[0])


def _decorate(result: dict) -> dict:
    """Add Ayurvedic names, toxicity and a confidence label."""
    cands = []
    for c in result["candidates"]:
        ay, toxic = AYURVEDIC.get(c["scientific"].lower(), ("", False))
        cands.append({**c, "ayurvedic": ay, "toxic": toxic})
    top = cands[0]
    return {
        "provider": result["provider"],
        "candidates": cands,
        "top": top,
        "confident": top["score"] >= SURE_CONFIDENCE,
        "low": top["score"] < MIN_CONFIDENCE,
    }


# ---------- question + prompt ----------
def _label(c: dict) -> str:
    return c["ayurvedic"] or (c["common"][0] if c["common"] else c["scientific"])


def _names(c: dict) -> list[str]:
    return [n for n in [c["ayurvedic"], *c["common"][:2], c["scientific"]] if n]


def _photo_note(ident: dict) -> str:
    top = ident["top"]
    others = ", ".join(f"{_label(c)} ({c['scientific']}, {round(c['score'] * 100)}%)" for c in ident["candidates"][1:])
    note = (
        f"PHOTO IDENTIFICATION: the user's photo was identified as {_label(top)} ({top['scientific']}) with "
        f"{round(top['score'] * 100)}% confidence by {'Pl@ntNet' if ident['provider'] == 'plantnet' else 'an AI vision model'}. "
    )
    if not ident["confident"]:
        note += "The match is not certain, so say clearly that it may be wrong"
        note += f" and mention these other possibilities: {others}. " if others else ". "
    note += (
        "Always remind the user in one short line never to eat or use a plant only because a photo suggests a name, "
        "and to confirm it with a qualified Ayurvedic doctor or botanist. "
    )
    if top["toxic"]:
        note += "IMPORTANT: this plant is TOXIC or poisonous. Start with a clear safety warning and do not suggest home use. "
    return note + "\n\n"


def _prepare_identified(owner: str, ident: dict, typed: str, history: list[dict]) -> chat.Prepared:
    top = ident["top"]
    names = _names(top)
    if typed:
        question = f"{typed}\n\n(This is about the plant in the user's photo: {', '.join(names)}.)"
    else:
        question = (
            f"Tell me about {_label(top)} ({top['scientific']}) in Ayurveda: its Sanskrit name, parts used, "
            f"traditional uses and precautions."
        )
    relevant: list[dict] = []
    has_docs = False
    try:
        has_docs = store.has_documents(owner)
        if has_docs:
            terms = [t for n in names for t in chat._key_terms(n)]
            hits = store.search(owner, " ".join(names), k=6)
            relevant = [h for h in hits if chat._relevant(h, terms)][:4]
    except Exception as e:  # noqa: BLE001
        print("SEARCH ERROR:", repr(e))
    if relevant:
        sources = [{"id": i, "filename": h["filename"], "page": h["page"], "snippet": h["text"][:300]}
                   for i, h in enumerate(relevant, start=1)]
        prompt = build_prompt_with_documents(question, relevant)
        mode = "documents"
    else:
        sources, mode = [], "general"
        prompt = build_prompt_general(question, has_docs)
    return chat.Prepared(mode, _photo_note(ident) + prompt, history, sources)


def _low_confidence_text(ident: dict | None, reason: str) -> str:
    text = reason + "\n\n## Tips for a better photo\n"
    text += "- Photograph one plant, in daylight, close enough to fill most of the picture.\n"
    text += "- Show a leaf, flower or fruit clearly. Several photos from different angles help.\n"
    text += "- Avoid blur, shadows and busy backgrounds.\n"
    text += "\nYou can also type the herb's name and I will share what I know about it."
    if ident and ident["candidates"]:
        poss = ", ".join(f"{_label(c)} ({c['scientific']})" for c in ident["candidates"][:3])
        text = f"The closest guesses were: {poss}, but I am not confident.\n\n" + text
    return text


def _sse(obj: dict) -> str:
    return f"data: {json.dumps(obj, ensure_ascii=False)}\n\n"


def _parse_history(raw: str) -> list[dict]:
    try:
        items = json.loads(raw) if raw else []
    except ValueError:
        return []
    hist = [{"role": m.get("role"), "content": str(m.get("content", ""))[:2000]}
            for m in items[-6:] if isinstance(m, dict) and m.get("role") in ("user", "assistant")]
    while hist and hist[0]["role"] != "user":
        hist.pop(0)
    return hist


# ---------- routes ----------
@router.post("/stream")
def identify_stream(
    file: UploadFile = File(...),
    question: str = Form(""),
    history: str = Form(""),
    x_user_id: str = Header(default="guest"),
):
    owner = chat._owner(x_user_id)
    typed = question.strip()[:1000]
    if typed and is_emergency(typed):
        def emergency():
            yield _sse({"type": "meta", "mode": "emergency", "sources": []})
            yield _sse({"type": "delta", "text": EMERGENCY_REPLY})
            yield _sse({"type": "done", "provider": "rules"})
        return StreamingResponse(emergency(), media_type="text/event-stream")

    jpeg = _prepare_image(file.file.read())  # raises a clear 400 for bad images
    blocked = _allow(owner)
    if blocked:
        raise HTTPException(429, blocked)

    t0 = time.perf_counter()

    def events():
        try:
            ident = _decorate(identify_image(jpeg))
        except NotAPlant:
            text = _low_confidence_text(None, "I could not find a plant in this photo.")
            yield _sse({"type": "meta", "mode": "general", "sources": [], "identification": None})
            yield _sse({"type": "delta", "text": text})
            yield _sse({"type": "done", "provider": "none"})
            return
        except Exception as e:  # noqa: BLE001
            print("[IDENTIFY] ERROR:", repr(e))
            msg = str(e) if isinstance(e, IdentifyError) else "Could not identify the photo right now. Please try again."
            yield _sse({"type": "error", "message": msg})
            return
        print(f"[TIMING] identify = {time.perf_counter() - t0:.2f}s  provider={ident['provider']}  "
              f"top={ident['top']['scientific']} {ident['top']['score']}")

        if ident["low"]:
            yield _sse({"type": "meta", "mode": "general", "sources": [], "identification": ident})
            yield _sse({"type": "delta", "text": _low_confidence_text(ident, "I could not identify this plant with enough confidence.")})
            yield _sse({"type": "done", "provider": "none"})
            return

        prep = _prepare_identified(owner, ident, typed, _parse_history(history))
        yield _sse({"type": "meta", "mode": prep.mode, "sources": prep.sources, "identification": ident})
        provider, first = "", True
        try:
            for provider, piece in llm.stream_generate(SYSTEM_PROMPT, prep.history, prep.prompt):
                if first:
                    print(f"[TIMING] first word = {time.perf_counter() - t0:.2f}s  provider={provider}")
                    first = False
                yield _sse({"type": "delta", "text": piece})
        except Exception as e:  # noqa: BLE001
            print("LLM ERROR:", repr(e))
            yield _sse({"type": "error", "message": chat._friendly(e)})
            return
        yield _sse({"type": "done", "provider": provider})

    return StreamingResponse(
        events(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("")
def identify_only(file: UploadFile = File(...), x_user_id: str = Header(default="guest")):
    jpeg = _prepare_image(file.file.read())
    blocked = _allow(chat._owner(x_user_id))
    if blocked:
        raise HTTPException(429, blocked)
    try:
        return {"identification": _decorate(identify_image(jpeg))}
    except NotAPlant:
        return {"identification": None, "message": "No plant found in this photo."}
    except IdentifyError as e:
        raise HTTPException(503, str(e))


@router.get("/health")
def identify_health():
    return {"plantnet_key": bool(PLANTNET_API_KEY), "gemini_backup": bool(llm.GEMINI_API_KEY),
            "used_today": _daily["n"], "daily_cap": DAILY_CAP}
