"""
publicar-server.py
Servidor HTTP simples que dispara o 23D4.bat (git add + commit + push)
ao receber qualquer requisição em http://localhost:8080/executar

Uso:
  python publicar-server.py
  (deixe rodando em segundo plano)

Endpoints:
  GET /          → mostra status e link para /executar
  GET /executar  → dispara 23D4.bat e retorna o log do git
"""

import http.server
import subprocess
import os
import threading
from datetime import datetime

PORT = 8080
BAT_PATH = os.path.join(os.path.dirname(os.path.abspath(__file__)), "23D4.bat")

_lock = threading.Lock()  # evita disparos simultâneos


class Handler(http.server.BaseHTTPRequestHandler):

    def log_message(self, format, *args):
        # Silencia o log padrão do servidor (usa print manual abaixo)
        pass

    def send_text(self, code, body):
        encoded = body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", "text/plain; charset=utf-8")
        self.send_header("Content-Length", str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def do_GET(self):
        if self.path == "/executar":
            self._executar()
        else:
            self.send_text(200, "Servidor publicar pronto.\nAcesse /executar para fazer o deploy.")

    def _executar(self):
        if not _lock.acquire(blocking=False):
            self.send_text(429, "Deploy ja em andamento. Aguarde e tente de novo.")
            return

        try:
            print(f"[{datetime.now():%H:%M:%S}] Disparando 23D4.bat...")
            result = subprocess.run(
                ["cmd", "/c", BAT_PATH],
                cwd=os.path.dirname(BAT_PATH),
                capture_output=True,
                text=True,
                encoding="utf-8",
                errors="replace",
                timeout=60,
            )
            saida = result.stdout + result.stderr
            ok = result.returncode == 0
            status = 200 if ok else 500
            emoji = "✅" if ok else "❌"
            resposta = f"{emoji} Deploy {'concluido' if ok else 'com erro'} (code {result.returncode})\n\n{saida}"
            print(resposta)
            self.send_text(status, resposta)
        except subprocess.TimeoutExpired:
            self.send_text(504, "Timeout: o bat demorou mais de 60s.")
        except Exception as e:
            self.send_text(500, f"Erro interno: {e}")
        finally:
            _lock.release()


if __name__ == "__main__":
    if not os.path.exists(BAT_PATH):
        print(f"ERRO: 23D4.bat nao encontrado em {BAT_PATH}")
        exit(1)

    server = http.server.HTTPServer(("localhost", PORT), Handler)
    print(f"Servidor publicar rodando em http://localhost:{PORT}/")
    print(f"Bat: {BAT_PATH}")
    print("Acesse /executar para publicar. Ctrl+C para parar.\n")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServidor encerrado.")
