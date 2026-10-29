#!/usr/bin/env bash
# Respaldo de Supabase con cifrado AGE antes de subirlo a cualquier repositorio.
# Requisitos: Docker con postgres:17-alpine, Python 3.10+, age, tar.
set -Eeuo pipefail
umask 077

: "${DATABASE_URL:?Falta DATABASE_URL (cadena de conexión a Supabase Pruebas)}"
: "${SUPABASE_URL:?Falta SUPABASE_URL}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Falta SUPABASE_SERVICE_ROLE_KEY}"
: "${AGE_RECIPIENT:?Falta AGE_RECIPIENT (clave pública age1...)}"
: "${BACKUP_OUTPUT:?Falta BACKUP_OUTPUT (directorio de salida)}"

case "$SUPABASE_URL" in
  "https://oktojwocvwrxvqxmyhtm.supabase.co") ;;
  *) echo "ERROR: este respaldo solamente está autorizado para Supabase PRUEBAS" >&2; exit 2 ;;
esac

case "$AGE_RECIPIENT" in
  age1*) ;;
  *) echo "ERROR: AGE_RECIPIENT no parece una clave pública age" >&2; exit 2 ;;
esac

# Impedir mezclar accidentalmente credenciales de Producción y Pruebas.
# En conexiones directas el ref figura en el host; en Session Pooler, en el usuario.
python3 - <<'PYCHECK'
import os, sys
from urllib.parse import urlsplit
s = urlsplit(os.environ['DATABASE_URL'])
ref = 'oktojwocvwrxvqxmyhtm'
if s.scheme not in ('postgresql', 'postgres') or ref not in ((s.hostname or '')+' '+(s.username or '')):
    sys.exit('ERROR: DATABASE_URL no corresponde inequívocamente a Supabase Pruebas')
PYCHECK

mkdir -p "$BACKUP_OUTPUT"
BACKUP_OUTPUT="$(cd "$BACKUP_OUTPUT" && pwd -P)"
TMP_DIR="$(mktemp -d)"
trap 'rm -rf -- "$TMP_DIR"' EXIT
mkdir -p "$TMP_DIR/paquete/storage" "$TMP_DIR/salida"

# Docker incluye pg_dump 17, necesario para respaldar PostgreSQL 17 de Pruebas.
# Conexión de base: usar Session Pooler o conexión directa, nunca Transaction Pooler.
docker run --rm \
  -e DATABASE_URL -v "$TMP_DIR/paquete:/respaldo" \
  postgres:17-alpine sh -eu -c '
    pg_dump --dbname="$DATABASE_URL" --format=custom --compress=9 \
      --no-owner --no-acl \
      --schema=public --schema=auth --schema=storage --schema=gestion_interna \
      --file=/respaldo/base.dump
    pg_restore --list /respaldo/base.dump >/dev/null
    psql --dbname="$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
      -c "SELECT row_to_json(x) FROM (SELECT bucket_id,name FROM storage.objects ORDER BY bucket_id,name) x" \
      > /respaldo/objetos.jsonl
    psql --dbname="$DATABASE_URL" -X -v ON_ERROR_STOP=1 -At \
      -c "SELECT row_to_json(x) FROM (SELECT jobname,schedule,active,command FROM cron.job ORDER BY jobname) x" \
      > /respaldo/cron_jobs.jsonl
  '

python3 "$(dirname "$0")/descargar_storage.py" \
  "$TMP_DIR/paquete/objetos.jsonl" "$TMP_DIR/paquete/storage"

python3 - "$TMP_DIR/paquete" <<'PY'
import hashlib, json, pathlib, sys
root = pathlib.Path(sys.argv[1]); files = {}
for p in sorted(root.rglob('*')):
    if p.is_file():
        files[str(p.relative_to(root))] = hashlib.sha256(p.read_bytes()).hexdigest()
(root/'integridad.json').write_text(json.dumps({"algoritmo":"sha256","archivos":files}, indent=2))
print(f"Integridad preparada: {len(files)} elementos; los datos permanecen privados")
PY

FECHA="$(date -u +%Y%m%dT%H%M%SZ)"
FINAL="$BACKUP_OUTPUT/aluconecta-pruebas-$FECHA.tar.gz.age"
# age produce archivo autenticado y cifrado; nunca subir el .dump o el .tar en claro.
tar -C "$TMP_DIR" -czf - paquete | age -r "$AGE_RECIPIENT" -o "$FINAL"
[ -s "$FINAL" ] || { echo "ERROR: archivo cifrado vacío" >&2; exit 3; }
( cd "$BACKUP_OUTPUT" && sha256sum "$(basename "$FINAL")" > "$(basename "$FINAL").sha256" )
echo "Respaldo cifrado y checksum generados: $(basename "$FINAL")"
echo "IMPORTANTE: comprobar la restauración en un entorno aislado antes de confiar en él."
