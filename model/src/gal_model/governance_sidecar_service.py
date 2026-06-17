"""Stdlib HTTP service wrapping the GAL governance sidecar.

Implements the "HTTP (future)" deployment mode noted in
:mod:`governance_sidecar`. It wraps the real
:func:`governance_sidecar.load_governance_sidecar` context (its ``score`` and
``govern`` callables) behind three endpoints:

  * ``GET  /health``  -> liveness + loaded model metadata
  * ``POST /score``   -> {"features": {...}, "title": "..."} -> sidecar.score()
  * ``POST /govern``  -> {"features": {...}, "title": "..."} -> sidecar.govern()

Model loading is **lazy**: the model is loaded on the first ``/score`` or
``/govern`` request (and the result, or the load error, is cached). This keeps
the HTTP port bound immediately so ``GET /health`` always returns 200 — reporting
``model_loaded: true|false`` — regardless of whether a checkpoint is present. A
missing or unloadable checkpoint therefore no longer prevents the server from
binding (avoiding a k8s liveness/readiness CrashLoopBackOff); instead ``/score``
and ``/govern`` return a clear ``503`` until/unless the model can load.

No web-framework dependency is added: the repo has none, and only outbound
stdlib ``urllib`` HTTP exists today, so this uses ``http.server`` from the
standard library.

Environment / configuration:
  * ``GAL_MODEL_PATH``            checkpoint path (else sidecar auto-detects the
                                  ``tmp/*-mlp/gal-governance-decision.pt`` candidates).
  * ``GAL_SIDECAR_HOST``         bind host (default ``0.0.0.0``).
  * ``GAL_SIDECAR_PORT``         bind port (default ``8080``).
  * ``GAL_SATISFACTION_THRESHOLD`` confidence threshold (default ``0.85``).

The handler is decoupled from the HTTP server via :func:`dispatch`, so it can be
unit-tested against a fake sidecar context with no checkpoint on disk.
"""

from __future__ import annotations

import json
import os
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from typing import Any, Callable

DEFAULT_HOST = "0.0.0.0"
DEFAULT_PORT = 8080
SERVICE_NAME = "gal-governance-sidecar-service"
SERVICE_VERSION = "v0"


class SidecarError(Exception):
    """Raised for a client-side request error; carries an HTTP status code."""

    def __init__(self, status: int, message: str) -> None:
        super().__init__(message)
        self.status = status
        self.message = message


class LazySidecar:
    """A sidecar context that loads its model on first use.

    Implements the small read interface :func:`dispatch` relies on (``.get`` and
    ``__getitem__``) so it is a drop-in for the eager ``dict`` context. The model
    is loaded once on the first ``score``/``govern`` access; both success and
    failure are cached so ``/health`` never triggers a load and stays cheap.

    A plain ``dict`` (the injection seam used by tests) bypasses this entirely —
    :func:`dispatch` works with either an already-loaded dict or a LazySidecar.
    """

    def __init__(self, loader: Callable[[], dict[str, Any]]) -> None:
        self._loader = loader
        self._lock = threading.Lock()
        self._loaded: dict[str, Any] | None = None
        self._load_error: Exception | None = None
        self._attempted = False

    def _ensure_loaded(self) -> dict[str, Any]:
        # Double-checked locking so concurrent requests load the model once.
        if self._loaded is not None:
            return self._loaded
        with self._lock:
            if self._loaded is None and not self._attempted:
                self._attempted = True
                try:
                    self._loaded = self._loader()
                except Exception as exc:  # noqa: BLE001 - cached, surfaced as 503
                    self._load_error = exc
            if self._loaded is None:
                raise SidecarError(
                    503,
                    f"governance model unavailable: {self._load_error}",
                )
            return self._loaded

    @property
    def is_loaded(self) -> bool:
        return self._loaded is not None

    @property
    def load_error(self) -> Exception | None:
        return self._load_error

    def get(self, key: str, default: Any = None) -> Any:
        # /health reads ``metadata`` without forcing a load: report what we have.
        if key == "metadata":
            if self._loaded is not None:
                return self._loaded.get("metadata", {})
            return {}
        if self._loaded is not None:
            return self._loaded.get(key, default)
        return default

    def __getitem__(self, key: str) -> Any:
        # /score and /govern read the callables -> trigger (cached) load.
        return self._ensure_loaded()[key]


def _validate_request(body: Any) -> tuple[dict[str, Any], str]:
    if not isinstance(body, dict):
        raise SidecarError(400, "request body must be a JSON object")
    features = body.get("features")
    if not isinstance(features, dict):
        raise SidecarError(400, "features must be a JSON object")
    title = body.get("title", body.get("request_id", ""))
    if not isinstance(title, str):
        raise SidecarError(400, "title must be a string when provided")
    return features, title


def dispatch(
    sidecar: dict[str, Any],
    *,
    method: str,
    path: str,
    body: Any,
) -> tuple[int, dict[str, Any]]:
    """Route one request against a loaded sidecar context.

    Returns ``(status_code, response_json)``. Pure function (no I/O), so tests
    can call it directly with a fake sidecar.
    """
    route = path.split("?", 1)[0].rstrip("/") or "/"

    # Map each known route to the method it accepts. Unknown routes are 404
    # regardless of method; a known route hit with the wrong method is 405.
    route_methods = {
        "/health": "GET",
        "/": "GET",
        "/score": "POST",
        "/govern": "POST",
    }
    expected_method = route_methods.get(route)
    if expected_method is None:
        return 404, {"error": f"unknown route {route}"}
    if method != expected_method:
        return 405, {"error": f"method {method} not allowed on {route}"}

    if route in ("/health", "/"):
        metadata = sidecar.get("metadata", {})
        # A LazySidecar reports load state without forcing a load; a plain dict
        # context (tests / eager mode) is always considered loaded.
        if isinstance(sidecar, LazySidecar):
            model_loaded = sidecar.is_loaded
            load_error = (
                str(sidecar.load_error) if sidecar.load_error is not None else None
            )
        else:
            model_loaded = True
            load_error = None
        return 200, {
            "status": "ok",
            "service": SERVICE_NAME,
            "version": SERVICE_VERSION,
            "model_loaded": model_loaded,
            "load_error": load_error,
            "model_ref": metadata.get("model_ref"),
            "architecture": metadata.get("architecture"),
            "input_dim": metadata.get("input_dim"),
            "has_embedder": metadata.get("has_embedder"),
            "advisory_only": True,
            "physical_action_allowed": False,
            "hardware_commands_issued": False,
        }

    callable_name = "score" if route == "/score" else "govern"
    try:
        features, title = _validate_request(body)
        # Accessing the callable triggers a (cached) lazy model load; if the
        # checkpoint genuinely can't load this raises SidecarError(503).
        fn: Callable[..., dict[str, Any]] = sidecar[callable_name]
    except SidecarError as exc:
        return exc.status, {"error": exc.message}

    result = fn(features, title)
    return 200, result


def make_handler(sidecar: dict[str, Any]) -> type[BaseHTTPRequestHandler]:
    """Build a ``BaseHTTPRequestHandler`` subclass bound to a sidecar context."""

    class GovernanceSidecarHandler(BaseHTTPRequestHandler):
        server_version = f"{SERVICE_NAME}/{SERVICE_VERSION}"

        def _write_json(self, status: int, payload: dict[str, Any]) -> None:
            data = json.dumps(payload, sort_keys=True).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(data)))
            self.end_headers()
            self.wfile.write(data)

        def _read_body(self) -> Any:
            length = int(self.headers.get("Content-Length") or 0)
            if length <= 0:
                return None
            raw = self.rfile.read(length)
            if not raw:
                return None
            try:
                return json.loads(raw.decode("utf-8"))
            except json.JSONDecodeError as exc:
                raise SidecarError(400, f"invalid JSON body: {exc.msg}") from exc

        def _handle(self, method: str) -> None:
            try:
                body = self._read_body() if method == "POST" else None
                status, payload = dispatch(sidecar, method=method, path=self.path, body=body)
            except SidecarError as exc:
                status, payload = exc.status, {"error": exc.message}
            except Exception as exc:  # noqa: BLE001 - surface as 500 to client
                status, payload = 500, {"error": f"internal error: {exc}"}
            self._write_json(status, payload)

        def do_GET(self) -> None:  # noqa: N802 - http.server API
            self._handle("GET")

        def do_POST(self) -> None:  # noqa: N802 - http.server API
            self._handle("POST")

        def log_message(self, *args: Any) -> None:  # silence default stderr logging
            return

    return GovernanceSidecarHandler


def build_server(
    *,
    host: str = DEFAULT_HOST,
    port: int = DEFAULT_PORT,
    model_path: str | None = None,
    satisfaction_threshold: float = 0.85,
    sidecar: dict[str, Any] | None = None,
) -> ThreadingHTTPServer:
    """Construct (but do not start) the HTTP server.

    When no ``sidecar`` is injected, the real governance sidecar is wrapped in a
    :class:`LazySidecar` so the model loads on first ``/score``/``/govern`` rather
    than at construction time. This guarantees the port binds and ``GET /health``
    answers even when the checkpoint is missing or unloadable. An injected
    ``sidecar`` (used by tests with a fake model) is passed through unchanged.
    """
    context: Any
    if sidecar is None:
        def _loader() -> dict[str, Any]:
            from .governance_sidecar import load_governance_sidecar

            return load_governance_sidecar(
                model_path=model_path,
                satisfaction_threshold=satisfaction_threshold,
            )

        context = LazySidecar(_loader)
    else:
        context = sidecar
    handler = make_handler(context)
    return ThreadingHTTPServer((host, port), handler)


def console_main() -> None:
    host = os.getenv("GAL_SIDECAR_HOST", DEFAULT_HOST)
    port = int(os.getenv("GAL_SIDECAR_PORT", str(DEFAULT_PORT)))
    model_path = os.getenv("GAL_MODEL_PATH") or None
    threshold = float(os.getenv("GAL_SATISFACTION_THRESHOLD", "0.85"))

    server = build_server(
        host=host,
        port=port,
        model_path=model_path,
        satisfaction_threshold=threshold,
    )
    print(f"{SERVICE_NAME} listening on http://{host}:{port} (GET /health, POST /score, POST /govern)")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        server.server_close()


if __name__ == "__main__":
    console_main()
