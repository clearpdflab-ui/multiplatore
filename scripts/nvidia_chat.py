"""CLI per NVIDIA API (endpoint OpenAI-compatible).

Uso:
  python scripts/nvidia_chat.py "La tua domanda"
  python scripts/nvidia_chat.py            # modalita' interattiva (REPL)
La chiave viene letta da NVIDIA_API_KEY (variabile d'ambiente o file .env).
"""
from __future__ import annotations

import argparse
import os
import sys
from pathlib import Path

from openai import OpenAI

BASE_URL = "https://integrate.api.nvidia.com/v1"
# deepseek-v4-pro-0813 / v4-flash-0731: backend NVIDIA in timeout (2026-09).
# Modelli verificati funzionanti: mistralai/mistral-nemotron (veloce), openai/gpt-oss-20b.
DEFAULT_MODEL = "mistralai/mistral-nemotron"


def load_env() -> None:
    env_path = Path(__file__).resolve().parent.parent / ".env"
    if not env_path.exists():
        return
    for line in env_path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def make_client() -> OpenAI:
    load_env()
    api_key = os.environ.get("NVIDIA_API_KEY")
    if not api_key:
        sys.exit("Errore: NVIDIA_API_KEY non trovata (ambiente o .env)")
    return OpenAI(base_url=BASE_URL, api_key=api_key, timeout=120, max_retries=1)


def ask(client: OpenAI, model: str, prompt: str) -> None:
    completion = client.chat.completions.create(
        model=model,
        messages=[{"role": "user", "content": prompt}],
        temperature=1,
        top_p=0.95,
        max_tokens=4096,
        stream=False,
    )
    print(completion.choices[0].message.content)


def main() -> None:
    parser = argparse.ArgumentParser(description="Chat con NVIDIA API")
    parser.add_argument("prompt", nargs="*", help="domanda da porre al modello")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    args = parser.parse_args()

    client = make_client()

    if args.prompt:
        ask(client, args.model, " ".join(args.prompt))
        return

    print(f"Modello: {args.model}  (Ctrl+D per uscire)")
    while True:
        try:
            prompt = input("> ").strip()
        except EOFError:
            break
        if not prompt:
            continue
        ask(client, args.model, prompt)


if __name__ == "__main__":
    main()
