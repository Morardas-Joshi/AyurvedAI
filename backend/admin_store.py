"""Remembers seed records that an administrator deleted.

The herb, medicine and lifestyle seed loaders re-create missing rows every time the
server starts. Without this list, anything the admin deleted would come back after
a restart. Keys are plain strings (a slug, or "title|slot" style composite keys).
"""

import json
import threading
from pathlib import Path

REMOVED_PATH = Path(__file__).resolve().parent / "seed" / "admin_removed.json"
_lock = threading.Lock()


def _read() -> dict[str, list[str]]:
    try:
        data = json.loads(REMOVED_PATH.read_text(encoding="utf-8"))
        return {key: list(value) for key, value in data.items() if isinstance(value, list)}
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


def _write(data: dict[str, list[str]]) -> None:
    temporary = REMOVED_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    temporary.replace(REMOVED_PATH)


def removed_keys(kind: str) -> set[str]:
    return set(_read().get(kind, []))


def mark_removed(kind: str, key: str) -> None:
    with _lock:
        data = _read()
        values = set(data.get(kind, []))
        values.add(key)
        data[kind] = sorted(values)
        _write(data)


def unmark_removed(kind: str, key: str) -> None:
    with _lock:
        data = _read()
        values = set(data.get(kind, []))
        if key not in values:
            return
        values.discard(key)
        data[kind] = sorted(values)
        _write(data)
