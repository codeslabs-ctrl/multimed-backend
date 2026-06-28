#!/usr/bin/env bash
# Chatbot DemoMed (Deno) — PM2
#
# Misma idea que en deploy-demomed-codes-labs-backend-git.sh:
#   PROJECT_DIR="/opt/proyectos/demomed/codeslabs-demomed-backend"
# El chatbot vive en:  $PROJECT_DIR/chatbot
#
# PROJECT_DIR tiene valor por defecto abajo (mismo que deploy-demomed-codes-labs-backend-git.sh).
# Si tu backend está en otra ruta: export PROJECT_DIR="/tu/ruta/codeslabs-demomed-backend"
#
# Orden de resolución de la carpeta del chatbot (donde está server.ts):
#   1) CHATBOT_DIR  (si la defines, gana; ruta absoluta a .../chatbot)
#   2) $PROJECT_DIR/chatbot  (PROJECT_DIR por defecto o el que exportes)
#   3) Carpeta donde está este .sh y rutas típicas debajo (ver resolve_chatbot_dir)
#
# La URL del API Node NO va aquí: va en chatbot/.env → BACKEND_URL
#
# Uso:  ./start-chatbot.sh  |  restart | stop | status | logs

set -e

# Misma raíz del backend que en deploy-demomed-codes-labs-backend-git.sh
PROJECT_DIR="${PROJECT_DIR:-/opt/proyectos/demomed/codeslabs-demomed-backend}"

PM2_CHATBOT_NAME="${PM2_CHATBOT_NAME:-demomed-chatbot}"
SCRIPT_HOME="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

resolve_chatbot_dir() {
  if [ -n "${CHATBOT_DIR:-}" ]; then
    if [ ! -f "$CHATBOT_DIR/server.ts" ]; then
      echo "❌ CHATBOT_DIR no contiene server.ts: $CHATBOT_DIR" >&2
      exit 1
    fi
    cd "$CHATBOT_DIR" && pwd
    return
  fi
  if [ -n "${PROJECT_DIR:-}" ]; then
    local pd="$PROJECT_DIR/chatbot"
    if [ -f "$pd/server.ts" ]; then
      cd "$pd" && pwd
      return
    fi
  fi
  local d
  for d in \
    "$SCRIPT_HOME" \
    "$SCRIPT_HOME/chatbot" \
    "$SCRIPT_HOME/backend/demomed-backend/chatbot" \
    "$SCRIPT_HOME/demomed-backend/chatbot"
  do
    if [ -f "$d/server.ts" ]; then
      cd "$d" && pwd
      return
    fi
  done
  echo ""
}

CHATBOT_DIR="$(resolve_chatbot_dir)"
if [ -z "$CHATBOT_DIR" ]; then
  echo "❌ No encontré la carpeta del chatbot." >&2
  echo "   Exporta el mismo PROJECT_DIR que en el deploy, por ejemplo:" >&2
  echo "   export PROJECT_DIR=\"/opt/proyectos/demomed/codeslabs-demomed-backend\"" >&2
  echo "   O la ruta directa: export CHATBOT_DIR=.../chatbot" >&2
  exit 1
fi
cd "$CHATBOT_DIR"

cmd="${1:-start}"

need_deno() {
  command -v deno &>/dev/null || { echo "❌ Instala Deno: https://deno.land/"; exit 1; }
}
need_pm2() {
  command -v pm2 &>/dev/null || { echo "❌ Instala PM2: npm i -g pm2"; exit 1; }
}

DENO_RUN='deno run --allow-net --allow-env --allow-read server.ts'

case "$cmd" in
  start)
    need_deno
    need_pm2
    [ -f server.ts ] || { echo "❌ No está server.ts en $CHATBOT_DIR"; exit 1; }
    [ -f .env ] || echo "⚠️  Falta .env (copia desde .env.example)"
    echo "📁 $CHATBOT_DIR"
    if deno compile --allow-net --allow-env --allow-read server.ts -o demomed-chatbot 2>/dev/null; then
      if pm2 list 2>/dev/null | grep -q "$PM2_CHATBOT_NAME"; then
        pm2 restart "$PM2_CHATBOT_NAME" --update-env && echo "✅ Reiniciado (binario)"
      else
        pm2 start ./demomed-chatbot --name "$PM2_CHATBOT_NAME" && echo "✅ Iniciado (binario)"
      fi
    else
      echo "⚠️  compile falló; usando deno run"
      pm2 list 2>/dev/null | grep -q "$PM2_CHATBOT_NAME" && pm2 delete "$PM2_CHATBOT_NAME" 2>/dev/null || true
      pm2 start "$DENO_RUN" --name "$PM2_CHATBOT_NAME" --interpreter none --cwd "$CHATBOT_DIR" && echo "✅ Iniciado (deno run)"
    fi
    pm2 save 2>/dev/null || true
    ;;
  stop)
    need_pm2
    pm2 stop "$PM2_CHATBOT_NAME" 2>/dev/null && echo "✅ Detenido" || echo "ℹ️  No activo"
    pm2 save 2>/dev/null || true
    ;;
  restart)
    need_pm2
    pm2 restart "$PM2_CHATBOT_NAME" --update-env && echo "✅ Reiniciado" || { echo "ℹ️  Ejecuta: $0 start"; exit 1; }
    pm2 save 2>/dev/null || true
    ;;
  status)
    need_pm2
    pm2 show "$PM2_CHATBOT_NAME" 2>/dev/null || true
    ;;
  logs)
    need_pm2
    pm2 logs "$PM2_CHATBOT_NAME" --lines 80
    ;;
  *)
    echo "Uso: $0 [start|stop|restart|status|logs]   (sin argumento = start)"
    exit 1
    ;;
esac
