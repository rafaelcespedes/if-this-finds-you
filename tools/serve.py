"""Tiny no-cache static server for the spike: python3 tools/serve.py [port]  (serves the spike folder)"""
import http.server, os, sys, functools
class H(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
print(f"http://127.0.0.1:{port}/index.html")
http.server.ThreadingHTTPServer(("127.0.0.1", port), functools.partial(H, directory=root)).serve_forever()
