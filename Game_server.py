#!/usr/bin/env python3
"""
================================================================
NOVA BLITZ v3 — game_server.py
Serveur 100 % stdlib Python (aucune dépendance externe)

Routes disponibles
──────────────────
GET  /                      → index.html
GET  /<fichier>             → fichiers statiques (css, js, …)

GET  /api/scores            → top 10 scores
POST /api/scores            → soumettre un score
     body JSON : { score, tier, waves, kills, time_sec, player_name? }
     réponse   : { success, rank, is_record, entry, top10 }
DELETE /api/scores          → vider les scores (dev/reset)

GET  /api/stats             → statistiques globales
GET  /api/leaderboard       → top 10 formaté (HTML-safe)
GET  /api/info              → infos serveur

Lancer : python3 game_server.py
URL    : http://localhost:8080
================================================================
"""

from __future__ import annotations

import gzip
import hashlib
import http.server
import json
import logging
import mimetypes
import os
import re
import signal
import socketserver
import sys
import threading
import time
import urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

# ────────────────────────────────────────────────────────────────
# Configuration
# ────────────────────────────────────────────────────────────────
BASE_DIR     = Path(__file__).resolve().parent
FRONTEND_DIR = BASE_DIR                          # index.html est au même niveau
DATA_DIR     = BASE_DIR / "data"
SCORES_FILE  = DATA_DIR / "scores.json"
LOG_FILE     = DATA_DIR / "server.log"
PORT         = 8080
HOST         = "0.0.0.0"
VERSION      = "3.0.0"
MAX_SCORES   = 10        # entrées conservées dans le leaderboard
MAX_NAME_LEN = 24        # longueur max du pseudo joueur
MAX_SCORE    = 9_999_999 # valeur max acceptée (anti-triche basique)

DATA_DIR.mkdir(parents=True, exist_ok=True)

# ────────────────────────────────────────────────────────────────
# Logging
# ────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-7s  %(message)s",
    datefmt="%H:%M:%S",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler(LOG_FILE, encoding="utf-8"),
    ],
)
log = logging.getLogger("nova-blitz")

# ────────────────────────────────────────────────────────────────
# Thread-lock pour accès concurrents au fichier JSON
# ────────────────────────────────────────────────────────────────
_lock = threading.Lock()

# ────────────────────────────────────────────────────────────────
# Couche données — scores
# ────────────────────────────────────────────────────────────────

def _empty_db() -> dict:
    return {"scores": [], "meta": {"created": _now_iso(), "total_games": 0}}


def _load() -> dict:
    """Charge la base depuis le disque. Thread-safe."""
    with _lock:
        if SCORES_FILE.exists():
            try:
                with open(SCORES_FILE, encoding="utf-8") as f:
                    data = json.load(f)
                # Migration depuis ancien format
                if "infinite" in data:
                    migrated = _empty_db()
                    for entry in data.get("infinite", []):
                        migrated["scores"].append({
                            "score":       entry.get("score", 0),
                            "tier":        entry.get("tier", 1),
                            "waves":       entry.get("waves", 0),
                            "kills":       entry.get("kills", 0),
                            "time_sec":    0,
                            "player_name": entry.get("label", "Anonyme"),
                            "date":        entry.get("date", ""),
                            "timestamp":   entry.get("timestamp", _now_iso()),
                            "id":          _make_id(entry),
                        })
                    migrated["scores"].sort(key=lambda x: x["score"], reverse=True)
                    migrated["scores"] = migrated["scores"][:MAX_SCORES]
                    _save(migrated)
                    log.info("Base migrée depuis ancien format v2")
                    return migrated
                return data
            except (json.JSONDecodeError, OSError) as exc:
                log.warning("Fichier scores corrompu (%s) — réinitialisation", exc)
        db = _empty_db()
        _save(db)
        return db


def _save(data: dict) -> None:
    """Écrit la base sur le disque. Appeler sous _lock."""
    tmp = SCORES_FILE.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
    tmp.replace(SCORES_FILE)


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _make_id(entry: dict) -> str:
    """ID court unique basé sur timestamp + score."""
    raw = f"{entry.get('timestamp','')}{entry.get('score',0)}"
    return hashlib.sha1(raw.encode()).hexdigest()[:10]


# ────────────────────────────────────────────────────────────────
# Logique métier
# ────────────────────────────────────────────────────────────────

def validate_score_body(body: dict) -> tuple[bool, str]:
    """
    Valide les champs d'un score soumis.
    Retourne (ok, message_erreur).
    """
    score = body.get("score")
    if not isinstance(score, int) or score < 0:
        return False, "score doit être un entier >= 0"
    if score > MAX_SCORE:
        return False, f"score dépasse la limite maximale ({MAX_SCORE})"

    tier = body.get("tier", 1)
    if not isinstance(tier, int) or not (1 <= tier <= 10):
        return False, "tier doit être un entier entre 1 et 10"

    waves = body.get("waves", 0)
    if not isinstance(waves, int) or waves < 0:
        return False, "waves doit être un entier >= 0"

    kills = body.get("kills", 0)
    if not isinstance(kills, int) or kills < 0:
        return False, "kills doit être un entier >= 0"

    time_sec = body.get("time_sec", 0)
    if not isinstance(time_sec, (int, float)) or time_sec < 0:
        return False, "time_sec doit être un nombre >= 0"

    name = body.get("player_name", "Anonyme")
    if not isinstance(name, str):
        return False, "player_name doit être une chaîne"
    if len(name.strip()) == 0:
        body["player_name"] = "Anonyme"
    elif len(name) > MAX_NAME_LEN:
        body["player_name"] = name[:MAX_NAME_LEN]
    # Nettoyer les caractères dangereux (XSS minimal)
    body["player_name"] = re.sub(r"[<>\"'&]", "", body["player_name"]).strip() or "Anonyme"

    return True, ""


def submit_score(body: dict) -> dict:
    """
    Insère un score validé, retourne rang + état record.
    Thread-safe.
    """
    ok, err = validate_score_body(body)
    if not ok:
        return {"error": err}

    now = datetime.now(timezone.utc)
    entry = {
        "score":       int(body["score"]),
        "tier":        int(body.get("tier", 1)),
        "waves":       int(body.get("waves", 0)),
        "kills":       int(body.get("kills", 0)),
        "time_sec":    float(body.get("time_sec", 0)),
        "player_name": body.get("player_name", "Anonyme"),
        "date":        now.strftime("%d/%m/%Y"),
        "timestamp":   now.isoformat(),
        "id":          "",   # rempli après
    }
    entry["id"] = _make_id(entry)

    with _lock:
        db = _load()
        db["meta"]["total_games"] = db["meta"].get("total_games", 0) + 1
        db["scores"].append(entry)
        db["scores"].sort(key=lambda x: x["score"], reverse=True)
        db["scores"] = db["scores"][:MAX_SCORES]
        _save(db)
        rank = next(
            (i + 1 for i, e in enumerate(db["scores"]) if e["id"] == entry["id"]),
            None,
        )
        top10 = db["scores"]

    is_record = rank == 1
    log.info(
        "Score soumis — %s  pts=%-7d  tier=%d  waves=%d  rang=#%s",
        entry["player_name"], entry["score"], entry["tier"],
        entry["waves"], rank,
    )
    return {
        "success":   True,
        "rank":      rank,
        "is_record": is_record,
        "entry":     entry,
        "top10":     top10,
    }


def get_scores() -> list:
    return _load()["scores"]


def get_stats() -> dict:
    """Calcule des statistiques globales à partir des scores."""
    db     = _load()
    scores = db["scores"]
    meta   = db.get("meta", {})

    if not scores:
        return {
            "total_games":    meta.get("total_games", 0),
            "leaderboard_entries": 0,
            "best_score":     0,
            "best_player":    None,
            "avg_score":      0,
            "avg_tier":       0,
            "avg_waves":      0,
            "avg_kills":      0,
            "avg_time_sec":   0,
            "server_uptime_sec": round(time.time() - _START_TIME),
            "version":        VERSION,
        }

    best   = scores[0]
    avg    = lambda key: round(sum(s[key] for s in scores) / len(scores), 1)

    return {
        "total_games":         meta.get("total_games", len(scores)),
        "leaderboard_entries": len(scores),
        "best_score":          best["score"],
        "best_player":         best["player_name"],
        "avg_score":           avg("score"),
        "avg_tier":            avg("tier"),
        "avg_waves":           avg("waves"),
        "avg_kills":           avg("kills"),
        "avg_time_sec":        avg("time_sec"),
        "server_uptime_sec":   round(time.time() - _START_TIME),
        "version":             VERSION,
    }


def clear_scores() -> dict:
    with _lock:
        db = _empty_db()
        _save(db)
    log.warning("Leaderboard vidé (requête DELETE)")
    return {"success": True, "message": "Leaderboard réinitialisé"}


# ────────────────────────────────────────────────────────────────
# Serveur HTTP
# ────────────────────────────────────────────────────────────────

_START_TIME = time.time()

# Types MIME supplémentaires
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("text/css",               ".css")
mimetypes.add_type("image/svg+xml",          ".svg")
mimetypes.add_type("application/json",       ".json")
mimetypes.add_type("font/woff2",             ".woff2")


class _Handler(http.server.BaseHTTPRequestHandler):
    """
    Gestionnaire de requêtes HTTP.
    — Sert les fichiers statiques depuis FRONTEND_DIR
    — Expose l'API REST sous /api/
    — Compresse les réponses si le client accepte gzip
    """

    # ── Routing principal ─────────────────────────────────────────
    def do_OPTIONS(self):
        self._send(204, b"", "text/plain")

    def do_GET(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path.startswith("/api/"):
            self._api_get(parsed)
        else:
            self._serve_static(parsed.path)

    def do_POST(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/scores":
            self._api_post_score()
        else:
            self._send_json({"error": "Route introuvable"}, 404)

    def do_DELETE(self):
        parsed = urllib.parse.urlparse(self.path)
        if parsed.path == "/api/scores":
            self._send_json(clear_scores())
        else:
            self._send_json({"error": "Route introuvable"}, 404)

    # ── API GET ───────────────────────────────────────────────────
    def _api_get(self, parsed: urllib.parse.ParseResult):
        path = parsed.path

        if path == "/api/scores":
            self._send_json({"scores": get_scores(), "count": len(get_scores())})

        elif path == "/api/stats":
            self._send_json(get_stats())

        elif path == "/api/leaderboard":
            scores = get_scores()
            medals = ["🥇", "🥈", "🥉"]
            rows = []
            for i, s in enumerate(scores):
                rows.append({
                    "rank":        i + 1,
                    "medal":       medals[i] if i < 3 else f"#{i+1}",
                    "player_name": s["player_name"],
                    "score":       s["score"],
                    "tier":        s["tier"],
                    "waves":       s["waves"],
                    "kills":       s["kills"],
                    "time_fmt":    _fmt_time(s.get("time_sec", 0)),
                    "date":        s["date"],
                })
            self._send_json({"leaderboard": rows, "count": len(rows)})

        elif path == "/api/info":
            self._send_json({
                "name":    "Nova Blitz v3 Server",
                "version": VERSION,
                "status":  "online",
                "uptime_sec": round(time.time() - _START_TIME),
                "scores_count": len(get_scores()),
            })

        else:
            self._send_json({"error": f"Route '{path}' introuvable"}, 404)

    # ── API POST score ────────────────────────────────────────────
    def _api_post_score(self):
        length = int(self.headers.get("Content-Length", 0))
        if length == 0:
            self._send_json({"error": "Corps JSON requis"}, 400)
            return
        raw = self.rfile.read(length)
        try:
            body = json.loads(raw)
        except json.JSONDecodeError:
            self._send_json({"error": "JSON invalide"}, 400)
            return

        result = submit_score(body)
        code   = 201 if "error" not in result else 400
        self._send_json(result, code)

    # ── Fichiers statiques ────────────────────────────────────────
    def _serve_static(self, url_path: str):
        # Normaliser le chemin
        safe = url_path.lstrip("/") or "index.html"
        # Empêcher la traversée de répertoire
        file_path = (FRONTEND_DIR / safe).resolve()
        if not str(file_path).startswith(str(FRONTEND_DIR.resolve())):
            self._send(403, b"Forbidden", "text/plain")
            return

        # Répertoire → index.html
        if file_path.is_dir():
            file_path = file_path / "index.html"

        if not file_path.exists():
            self._send(404, b"Not found", "text/plain")
            return

        mime = mimetypes.guess_type(str(file_path))[0] or "application/octet-stream"
        content = file_path.read_bytes()

        # Cache léger : ETag basé sur taille + mtime
        etag = f'"{len(content)}-{int(file_path.stat().st_mtime)}"'
        if self.headers.get("If-None-Match") == etag:
            self.send_response(304)
            self._cors()
            self.end_headers()
            return

        self._send(200, content, mime, extra_headers={
            "Cache-Control": "no-cache",
            "ETag": etag,
        })

    # ── Helpers réponse ───────────────────────────────────────────
    def _send_json(self, obj: Any, code: int = 200):
        body = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
        self._send(code, body, "application/json; charset=utf-8")

    def _send(self, code: int, body: bytes, content_type: str,
              extra_headers: dict | None = None):
        # Compression gzip si supportée et gain réel
        accepts_gzip = "gzip" in self.headers.get("Accept-Encoding", "")
        if accepts_gzip and len(body) > 512:
            body = gzip.compress(body, compresslevel=6)
            compressed = True
        else:
            compressed = False

        self.send_response(code)
        self._cors()
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        if compressed:
            self.send_header("Content-Encoding", "gzip")
        if extra_headers:
            for k, v in extra_headers.items():
                self.send_header(k, v)
        self.end_headers()
        if self.command != "HEAD":
            self.wfile.write(body)

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Vary", "Origin")

    # ── Logs colorés (ANSI) ───────────────────────────────────────
    _STATUS_COLOR = {2: "\033[32m", 3: "\033[36m", 4: "\033[33m", 5: "\033[31m"}
    _RESET = "\033[0m"

    def log_message(self, fmt: str, *args):
        code_str = args[1] if len(args) > 1 else "000"
        try:
            code_int  = int(code_str)
            color = self._STATUS_COLOR.get(code_int // 100, "")
        except ValueError:
            color = ""
        ts  = datetime.now().strftime("%H:%M:%S")
        msg = fmt % args
        print(f"  [{ts}]  {color}{msg}{self._RESET}")


# ────────────────────────────────────────────────────────────────
# Utilitaire
# ────────────────────────────────────────────────────────────────

def _fmt_time(seconds: float) -> str:
    """Formate un nombre de secondes en mm:ss."""
    s = int(seconds)
    return f"{s // 60}:{s % 60:02d}"


# ────────────────────────────────────────────────────────────────
# Serveur avec arrêt propre (Ctrl+C)
# ────────────────────────────────────────────────────────────────

class _ReusableTCPServer(socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads      = True   # threads démons → pas de zombie au Ctrl+C


def _run():
    _banner()
    server = _ReusableTCPServer((HOST, PORT), _Handler)

    def _shutdown(sig, frame):
        print("\n\n  [✓] Arrêt du serveur…")
        threading.Thread(target=server.shutdown, daemon=True).start()

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    log.info("Serveur démarré sur http://localhost:%d", PORT)
    server.serve_forever()
    log.info("Serveur arrêté proprement.")


# ────────────────────────────────────────────────────────────────
# Bannière de démarrage
# ────────────────────────────────────────────────────────────────

def _banner():
    scores_count = len(get_scores())
    print()
    print("  \033[36m╔══════════════════════════════════════════════════╗\033[0m")
    print("  \033[36m║\033[0m  \033[1mNOVA BLITZ v3\033[0m  —  Serveur de jeu Python        \033[36m║\033[0m")
    print("  \033[36m╠══════════════════════════════════════════════════╣\033[0m")
    print(f"  \033[36m║\033[0m  Jeu        : \033[32mhttp://localhost:{PORT}\033[0m               \033[36m║\033[0m")
    print(f"  \033[36m║\033[0m  API scores : \033[32mhttp://localhost:{PORT}/api/scores\033[0m    \033[36m║\033[0m")
    print(f"  \033[36m║\033[0m  Stats      : \033[32mhttp://localhost:{PORT}/api/stats\033[0m     \033[36m║\033[0m")
    print(f"  \033[36m║\033[0m  Leaderboard: \033[32mhttp://localhost:{PORT}/api/leaderboard\033[0m\033[36m║\033[0m")
    print("  \033[36m╠══════════════════════════════════════════════════╣\033[0m")
    print(f"  \033[36m║\033[0m  Scores enregistrés : {scores_count:<4}  │  Port : {PORT}         \033[36m║\033[0m")
    print(f"  \033[36m║\033[0m  Données : {str(DATA_DIR):<42}\033[36m║\033[0m")
    print("  \033[36m║\033[0m  Arrêter : Ctrl+C                                  \033[36m║\033[0m")
    print("  \033[36m╚══════════════════════════════════════════════════╝\033[0m")
    print()


# ────────────────────────────────────────────────────────────────
# Point d'entrée
# ────────────────────────────────────────────────────────────────
if __name__ == "__main__":
    _run()