"""Tiny local web server for Veloura (Python 3, standard library only - no install).
Why not plain `python -m http.server`? On some Windows PCs the registry maps .js to text/plain, and browsers then REFUSE to
register a service worker (offline mode). This server sets correct MIME types itself and sends no-cache headers for app files.
Usage:  python server.py [port]     (START_WEBSITE.bat does this for you)"""
import http.server, os, socketserver, sys

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8090
TYPES = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
         '.json': 'application/json; charset=utf-8', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
         '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon', '.woff2': 'font/woff2', '.txt': 'text/plain; charset=utf-8', '.sql': 'text/plain; charset=utf-8'}

class Handler(http.server.SimpleHTTPRequestHandler):
    def guess_type(self, path):
        return TYPES.get(os.path.splitext(path)[1].lower()) or super().guess_type(path)
    def end_headers(self):
        p = self.path.split('?')[0]
        if p.endswith(('/', '.html', '.js', '.css', '.json')):
            self.send_header('Cache-Control', 'no-cache')          # always revalidate app files so edits show up immediately
        if p.endswith('sw.js'):
            self.send_header('Service-Worker-Allowed', '/')
        self.send_header('X-Content-Type-Options', 'nosniff')
        super().end_headers()
    def log_message(self, fmt, *args):
        pass

if __name__ == '__main__':
    os.chdir(os.path.dirname(os.path.abspath(__file__)))
    socketserver.ThreadingTCPServer.allow_reuse_address = True
    socketserver.ThreadingTCPServer.daemon_threads = True
    try:
        with socketserver.ThreadingTCPServer(('127.0.0.1', PORT), Handler) as srv:
            print('Veloura running at http://localhost:%d/  (Ctrl+C to stop)' % PORT)
            srv.serve_forever()
    except OSError as e:
        print('ERROR: cannot use port %d (%s). Another program is using it - close it or pick another port.' % (PORT, e)); sys.exit(1)
    except KeyboardInterrupt:
        pass
