"""JSON bridge used by the Pyodide worker."""

from __future__ import annotations

import json

from . import __version__, engine


def _answer(fn, payload: str) -> str:
    try:
        result = fn(json.loads(payload))
        return json.dumps({"ok": True, "version": __version__, **result}, ensure_ascii=False)
    except Exception as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)


def construir(payload: str) -> str:
    return _answer(engine.build, payload)


def analizar(payload: str) -> str:
    return _answer(engine.analyze, payload)


def exportar_3mf(payload: str) -> str:
    return _answer(engine.export_3mf, payload)


def exportar_kit(payload: str) -> str:
    return _answer(engine.export_kit, payload)
