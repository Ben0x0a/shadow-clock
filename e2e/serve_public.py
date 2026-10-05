"""serve_public.py — serves public/ for the browser tests with the platform's server.

Defines : a launcher that raises the listen backlog of `swp serve`'s server.
Used by : playwright.config.ts (webServer).
Uses    : platform/tools/swp_tools/serve.py (make_server, applies public/_headers).

WHY: http.server keeps a backlog of 5 pending connections. Three browser projects with
several workers each open more than that at once, so the OS resets some connections
(seen as ERR_CONNECTION_RESET on a script and a blank page). Raising the class attribute
before the server is created fixes it without forking the platform tool.
"""

import http.server
import pathlib
import sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "platform" / "tools"))
http.server.ThreadingHTTPServer.request_queue_size = 128

from swp_tools.serve import make_server  # noqa: E402  (needs the patched class attribute first)

make_server(ROOT / "public", int(sys.argv[1]) if len(sys.argv) > 1 else 4173).serve_forever()
