#!/usr/bin/env python3
"""Respaldo estricto de los objetos privados de Supabase Storage.

Lee un JSON por línea producido desde storage.objects. No imprime nombres de
archivos ni valores secretos, y aborta si falta cualquier objeto.
"""

import hashlib
import json
import os
from pathlib import Path
import sys
from urllib.parse import quote
from urllib.request import Request, urlopen


def guardar_objetos(lista: Path, destino: Path, url: str, clave: str, abrir=urlopen):
    destino.mkdir(parents=True, exist_ok=True)
    manifest = []
    vistos = set()
    for linea in lista.read_text(encoding="utf-8").splitlines():
        if not linea.strip():
            continue
        registro = json.loads(linea)
        bucket, nombre = registro["bucket_id"], registro["name"]
        if not isinstance(bucket, str) or not isinstance(nombre, str) or not bucket or not nombre:
            raise ValueError("Referencia Storage inválida")
        clave_objeto = (bucket, nombre)
        if clave_objeto in vistos:
            raise ValueError("Objeto Storage repetido")
        vistos.add(clave_objeto)
        identificador = hashlib.sha256((bucket + "\0" + nombre).encode()).hexdigest()
        ruta = destino / identificador
        destino_url = (
            url.rstrip("/") + "/storage/v1/object/authenticated/"
            + quote(bucket, safe="") + "/" + quote(nombre, safe="/")
        )
        req = Request(destino_url, headers={"apikey": clave, "Authorization": "Bearer " + clave})
        sha = hashlib.sha256()
        total = 0
        # El archivo solamente se considera respaldado si la descarga finalizó.
        with abrir(req, timeout=60) as respuesta, ruta.open("wb") as salida:
            while True:
                fragmento = respuesta.read(1024 * 1024)
                if not fragmento:
                    break
                salida.write(fragmento)
                sha.update(fragmento)
                total += len(fragmento)
        manifest.append({
            "bucket_id": bucket, "name": nombre, "respaldo": identificador,
            "bytes": total, "sha256": sha.hexdigest(),
        })
    (destino.parent / "storage_manifest.json").write_text(
        json.dumps({"objetos": manifest, "cantidad": len(manifest)}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return len(manifest)


def main():
    if len(sys.argv) != 3:
        raise SystemExit("Uso: descargar_storage.py OBJETOS_JSONL DIRECTORIO_DESTINO")
    url = os.environ.get("SUPABASE_URL", "")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if not url.startswith("https://") or not key:
        raise SystemExit("Faltan las credenciales de Supabase")
    cantidad = guardar_objetos(Path(sys.argv[1]), Path(sys.argv[2]), url, key)
    print(f"Storage verificado: {cantidad} objetos descargados; no se muestran rutas privadas")


if __name__ == "__main__":
    main()
