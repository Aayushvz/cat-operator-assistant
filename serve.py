"""Local dev server with caching disabled, so every reload shows the latest files.

Threaded: browsers open several connections at once (and sometimes idle preconnects),
which would block a single-threaded server and leave the page stuck loading.
"""
import http.server
import os

PORT = 4173
os.chdir(os.path.dirname(os.path.abspath(__file__)))


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


http.server.ThreadingHTTPServer.allow_reuse_address = True
with http.server.ThreadingHTTPServer(("127.0.0.1", PORT), NoCacheHandler) as httpd:
    print(f"Serving on http://localhost:{PORT}")
    httpd.serve_forever()
