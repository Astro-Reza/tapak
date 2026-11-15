"""Minimal Turso (libSQL) client over the Hrana HTTP API, stdlib only.

It mimics the slice of ``sqlite3.Connection`` that ``hub_db`` uses, so the same
query code runs against a local SQLite file or a Turso database:

    conn = TursoConnection.from_env()        # TURSO_DATABASE_URL, TURSO_AUTH_TOKEN
    row = conn.execute("SELECT * FROM checklists WHERE id = ?", ("pre",)).fetchone()
    row["title"]

Every ``execute`` is one HTTP round-trip and autocommits. ``batch`` sends many
statements in one request inside a transaction (all or nothing). No native
wheels are needed, which keeps the Vercel Python function small.

Protocol: https://github.com/tursodatabase/libsql/blob/main/docs/HRANA_3_SPEC.md
"""

from __future__ import annotations

import base64
import http.client
import json
import os
import re
import sqlite3
import threading
from typing import Any, Iterable, Iterator, List, Optional, Sequence, Tuple
from urllib.parse import urlsplit

Statement = Tuple[str, Sequence[Any]]


class TursoError(sqlite3.DatabaseError):
    """A statement failed or Turso could not be reached.

    Subclasses sqlite3.Error so existing ``except sqlite3.Error`` handlers
    (hub_routes returns 503) cover both backends.
    """


class Row:
    """Read-only row addressable by column name or index, like sqlite3.Row."""

    __slots__ = ("_cols", "_vals")

    def __init__(self, cols: List[str], vals: List[Any]):
        self._cols = cols
        self._vals = vals

    def __getitem__(self, key):
        if isinstance(key, str):
            try:
                return self._vals[self._cols.index(key)]
            except ValueError:
                raise IndexError(f"no such column: {key}") from None
        return self._vals[key]

    def keys(self) -> List[str]:
        return list(self._cols)

    def __iter__(self) -> Iterator[Any]:
        return iter(self._vals)

    def __len__(self) -> int:
        return len(self._vals)

    def __repr__(self) -> str:
        return f"Row({dict(zip(self._cols, self._vals))!r})"


class Cursor:
    def __init__(self, cols: List[str], rows: List[Row], rowcount: int, lastrowid: Optional[int]):
        self.description = [(c, None, None, None, None, None, None) for c in cols]
        self._rows = rows
        self._pos = 0
        self.rowcount = rowcount
        self.lastrowid = lastrowid

    def fetchone(self) -> Optional[Row]:
        if self._pos >= len(self._rows):
            return None
        self._pos += 1
        return self._rows[self._pos - 1]

    def fetchall(self) -> List[Row]:
        out = self._rows[self._pos:]
        self._pos = len(self._rows)
        return out

    def __iter__(self) -> Iterator[Row]:
        return iter(self.fetchall())


def _encode(value: Any) -> dict:
    if value is None:
        return {"type": "null"}
    if isinstance(value, bool):
        return {"type": "integer", "value": "1" if value else "0"}
    if isinstance(value, int):
        return {"type": "integer", "value": str(value)}
    if isinstance(value, float):
        return {"type": "float", "value": value}
    if isinstance(value, (bytes, bytearray, memoryview)):
        return {"type": "blob", "base64": base64.b64encode(bytes(value)).decode().rstrip("=")}
    return {"type": "text", "value": str(value)}


def _decode(cell: dict) -> Any:
    t = cell.get("type")
    if t == "null":
        return None
    if t == "integer":
        return int(cell["value"])
    if t == "float":
        return float(cell["value"])
    if t == "blob":
        b64 = cell["base64"]
        return base64.b64decode(b64 + "=" * (-len(b64) % 4))
    return cell.get("value")


def _stmt(sql: str, params: Sequence[Any] = ()) -> dict:
    return {"sql": sql, "args": [_encode(p) for p in params]}


def _cursor(result: dict) -> Cursor:
    cols = [c.get("name") or "" for c in result.get("cols", [])]
    rows = [Row(cols, [_decode(c) for c in r]) for r in result.get("rows", [])]
    last = result.get("last_insert_rowid")
    return Cursor(cols, rows, int(result.get("affected_row_count", 0)), int(last) if last else None)


def split_script(script: str) -> List[str]:
    """Split a schema file into statements. Drops comments and PRAGMAs.

    Only meant for plain DDL like schema_hub.sql (no triggers, no ';' or '--'
    inside string literals).
    """
    no_comments = re.sub(r"--[^\n]*", "", script)
    out = []
    for part in no_comments.split(";"):
        s = part.strip()
        if s and not s.upper().startswith("PRAGMA"):
            out.append(s)
    return out


class TursoConnection:
    """sqlite3-style connection to a Turso database over HTTPS.

    Thread-safe: requests are serialised on one keep-alive connection, which
    is reused across invocations while a serverless instance stays warm.
    """

    def __init__(self, url: str, auth_token: Optional[str], timeout: float = 15.0):
        # libsql://db-org.turso.io -> https://db-org.turso.io
        parts = urlsplit(re.sub(r"^(libsql|wss?)://", "https://", url.strip()))
        if parts.scheme not in ("https", "http") or not parts.hostname:
            raise ValueError(f"unsupported Turso URL: {url!r}")
        self._scheme = parts.scheme
        self._host = parts.hostname
        self._port = parts.port
        self._token = auth_token
        self._timeout = timeout
        self._http: Optional[http.client.HTTPConnection] = None
        self._lock = threading.Lock()

    @classmethod
    def from_env(cls) -> "TursoConnection":
        url = os.environ.get("TURSO_DATABASE_URL")
        if not url:
            raise TursoError("TURSO_DATABASE_URL is not set")
        return cls(url, os.environ.get("TURSO_AUTH_TOKEN"))

    # -- transport -----------------------------------------------------------

    def _connect(self) -> http.client.HTTPConnection:
        cls = http.client.HTTPSConnection if self._scheme == "https" else http.client.HTTPConnection
        return cls(self._host, self._port, timeout=self._timeout)

    def _pipeline(self, requests: List[dict]) -> List[dict]:
        body = json.dumps({"requests": requests + [{"type": "close"}]})
        headers = {"Content-Type": "application/json"}
        if self._token:
            headers["Authorization"] = f"Bearer {self._token}"
        with self._lock:
            for attempt in (0, 1):  # retry once on a dropped keep-alive socket
                if self._http is None:
                    self._http = self._connect()
                try:
                    self._http.request("POST", "/v2/pipeline", body=body, headers=headers)
                    resp = self._http.getresponse()
                    data = resp.read()
                    break
                except (OSError, http.client.HTTPException) as err:
                    self._http.close()
                    self._http = None
                    if attempt:
                        raise TursoError(f"Turso unreachable: {err}") from err
        if resp.status != 200:
            raise TursoError(f"Turso HTTP {resp.status}: {data[:300].decode(errors='replace')}")
        results = json.loads(data)["results"]
        return results[:-1]  # drop the "close" result

    @staticmethod
    def _unwrap(res: dict) -> dict:
        if res.get("type") == "error":
            raise TursoError(res.get("error", {}).get("message", "statement failed"))
        return res["response"]

    # -- sqlite3-like API ----------------------------------------------------

    def execute(self, sql: str, params: Sequence[Any] = ()) -> Cursor:
        res = self._pipeline([{"type": "execute", "stmt": _stmt(sql, params)}])[0]
        return _cursor(self._unwrap(res)["result"])

    def query_many(self, statements: Iterable[Statement]) -> List[List[Row]]:
        """Run independent reads in one round-trip; returns each one's rows."""
        reqs = [{"type": "execute", "stmt": _stmt(sql, params)} for sql, params in statements]
        return [_cursor(self._unwrap(r)["result"]).fetchall() for r in self._pipeline(reqs)]

    def batch(self, statements: Iterable[Statement]) -> List[Cursor]:
        """Run statements in one request and one transaction (all or nothing)."""
        stmts = [_stmt(sql, params) for sql, params in statements]
        if not stmts:
            return []
        steps = [{"stmt": {"sql": "BEGIN"}}]
        for s in stmts:
            steps.append({"stmt": s, "condition": {"type": "ok", "step": len(steps) - 1}})
        commit = len(steps)
        steps.append({"stmt": {"sql": "COMMIT"}, "condition": {"type": "ok", "step": commit - 1}})
        steps.append({"stmt": {"sql": "ROLLBACK"},
                      "condition": {"type": "not", "cond": {"type": "ok", "step": commit}}})
        res = self._unwrap(self._pipeline([{"type": "batch", "batch": {"steps": steps}}])[0])
        out = res["result"]
        for err in out.get("step_errors", []):
            if err:
                raise TursoError(err.get("message", "batch failed"))
        return [_cursor(r) for r in out["step_results"][1:commit]]

    def executescript(self, script: str) -> None:
        self.batch((s, ()) for s in split_script(script))

    # ``with conn:`` blocks in hub_db: each execute already autocommits.
    def __enter__(self) -> "TursoConnection":
        return self

    def __exit__(self, *exc) -> None:
        return None

    def commit(self) -> None:
        return None

    def close(self) -> None:
        """No-op: the shared keep-alive socket outlives a request on purpose."""
        return None

    def shutdown(self) -> None:
        with self._lock:
            if self._http is not None:
                self._http.close()
                self._http = None
