# c:\Users\Athyx\Desktop\Athyx-Network\Athyx-Network\server.py
"""
Local development server for Athyx Network.
Configured with required headers:
- Service-Worker-Allowed: /
- Correct MIME types (wasm, js, mjs, etc.)
- CORS headers for local asset & proxy worker requests
- No-cache headers for instant updates
"""

import os
import mimetypes
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

# Ensure mime types are registered
mimetypes.init()
mimetypes.add_type("application/wasm", ".wasm")
mimetypes.add_type("application/javascript", ".js")
mimetypes.add_type("application/javascript", ".mjs")
mimetypes.add_type("application/json", ".json")
mimetypes.add_type("text/css", ".css")
mimetypes.add_type("font/ttf", ".ttf")
mimetypes.add_type("font/woff", ".woff")
mimetypes.add_type("font/woff2", ".woff2")

PORT = int(os.environ.get("PORT", "8080"))
HOST = os.environ.get("HOST", "0.0.0.0")
WEB_ROOT = Path(__file__).resolve().parent

class AthyxHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(WEB_ROOT), **kwargs)

    def end_headers(self):
        # Service Worker support across scopes
        if self.path.endswith("sw.js") or "/scramjet/" in self.path:
            self.send_header("Service-Worker-Allowed", "/")

        # CORS support for local development
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")

        # Disable aggressive caching for live development
        self.send_header("Cache-Control", "no-cache, no-store, must-revalidate")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")

        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS, HEAD")
        self.send_header("Access-Control-Allow-Headers", "*")
        self.end_headers()

    def log_message(self, format, *args):
        # Clean request logging
        print(f"[{self.log_date_time_string()}] {format % args}")

def run():
    server_address = (HOST, PORT)
    httpd = ThreadingHTTPServer(server_address, AthyxHandler)
    display_host = "127.0.0.1" if HOST in ("0.0.0.0", "") else HOST
    print(f"==================================================")
    print(f" Athyx Network running locally at:")
    print(f"   http://{display_host}:{PORT}/")
    print(f"   http://localhost:{PORT}/")
    print(f" Serving directory: {WEB_ROOT}")
    print(f" Service-Worker-Allowed: / enabled")
    print(f"==================================================")
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server.")
        httpd.server_close()

if __name__ == "__main__":
    run()
