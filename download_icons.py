"""
Descarga todos los iconos de animatedicons.co usados en los templates Angular
y los guarda en public/assets/icons/. Luego actualiza cada archivo para usar
rutas locales.

Uso:
  python download_icons.py

Escanea automaticamente todos los archivos .html dentro de src/.
"""
from __future__ import annotations

import glob
import os
import re
import urllib.parse
import urllib.request


TEMPLATES_DIR = "src"
ICONS_DIR = os.path.join("public", "assets", "icons")
PUBLIC_ICONS_PATH = "assets/icons"

ICON_URL_PATTERN = re.compile(
    r"https://animatedicons\.co/get-icon\?[^\"'\s<>]+",
    re.IGNORECASE,
)


def safe_filename_part(value: str) -> str:
    value = urllib.parse.unquote_plus(value).strip().lower()
    value = re.sub(r"[^a-z0-9]+", "-", value)
    return value.strip("-") or "icon"


def icon_filename(url: str) -> str | None:
    parsed = urllib.parse.urlparse(url)
    query = urllib.parse.parse_qs(parsed.query)

    name = query.get("name", ["icon"])[0]
    style = query.get("style", ["minimalistic"])[0]
    token = query.get("token", [""])[0]

    if not token:
        return None

    name_part = safe_filename_part(name)
    style_part = safe_filename_part(style)
    token_part = safe_filename_part(token)[:8]
    return f"{name_part}-{style_part}-{token_part}.json"


def main() -> int:
    html_files = glob.glob(os.path.join(TEMPLATES_DIR, "**", "*.html"), recursive=True)
    print(f"Escaneando {len(html_files)} archivos HTML...\n")

    url_to_local: dict[str, str] = {}
    file_contents: dict[str, str] = {}

    for filepath in html_files:
        with open(filepath, "r", encoding="utf-8") as file:
            content = file.read()

        file_contents[filepath] = content

        for url in ICON_URL_PATTERN.findall(content):
            filename = icon_filename(url)
            if not filename:
                continue
            url_to_local[url] = os.path.join(ICONS_DIR, filename)

    print(f"Encontrados {len(url_to_local)} iconos unicos.\n")

    os.makedirs(ICONS_DIR, exist_ok=True)

    errors: list[tuple[str, str]] = []
    new_downloads = 0

    for url, local_path in sorted(url_to_local.items()):
        if os.path.exists(local_path):
            continue

        try:
            print(f"  Descargando {os.path.basename(local_path)} ...", end=" ")
            request = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
            with urllib.request.urlopen(request, timeout=15) as response:
                data = response.read()

            with open(local_path, "wb") as file:
                file.write(data)

            print("OK")
            new_downloads += 1
        except Exception as exc:
            print(f"ERROR: {exc}")
            errors.append((url, str(exc)))

    if new_downloads == 0:
        print("  Ningun icono nuevo (todos ya estaban descargados).")

    print()

    updated = 0
    for filepath, content in file_contents.items():
        new_content = content

        for url, local_path in url_to_local.items():
            local_src = f"{PUBLIC_ICONS_PATH}/{os.path.basename(local_path)}"
            new_content = new_content.replace(url, local_src)

        if new_content != content:
            with open(filepath, "w", encoding="utf-8", newline="") as file:
                file.write(new_content)
            print(f"  Actualizado: {filepath}")
            updated += 1

    print(f"\n{updated} archivo(s) actualizados con rutas locales.")

    if errors:
        print(f"\nAdvertencia: {len(errors)} iconos no se pudieron descargar:")
        for url, error in errors:
            print(f"  {url}\n    -> {error}")
        return 1

    print("Todos los iconos descargados correctamente.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
