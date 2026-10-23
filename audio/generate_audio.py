#!/usr/bin/env python3
"""Turn the episode scripts in audio/scripts/ into MP3 files in audio/mp3/.

Uses Kokoro-82M (Apache-2.0) through kokoro-onnx, running locally on the CPU.
No API keys or paid services are involved.

Setup:
    pip install kokoro-onnx soundfile
    mkdir -p audio/models && cd audio/models
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx
    curl -LO https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin

Usage:
    python3 audio/generate_audio.py                 # all scripts
    python3 audio/generate_audio.py 03_kademlia     # scripts whose name starts with this
Requires ffmpeg on PATH for the MP3 encoding.
"""
import argparse
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
from kokoro_onnx import Kokoro

HERE = Path(__file__).resolve().parent

# Spellings that the phonemizer gets wrong, applied only to the spoken text.
PRONUNCIATIONS = {
    r"\bX-OR\b": "ex-or",
    r"\betcd\b": "et-see-dee",
    r"\bEtcd\b": "Et-see-dee",
    r"\bkubelet\b": "koob-let",
    r"\bKube-proxy\b": "Koob proxy",
    r"\bkube-proxy\b": "koob proxy",
    r"\bKademlia\b": "Ka-demlia",
    r"\bnonces?\b": lambda m: "nonsses" if m.group(0).endswith("s") else "nonss",
    r"\b[Ii]dempoten": lambda m: ("Eye-dem-poten" if m.group(0)[0] == "I" else "eye-dem-poten"),
    r"\bznodes?\b": lambda m: "zee-nodes" if m.group(0).endswith("s") else "zee-node",
    r"\bzxid\b": "zee-ex-eye-dee",
    r"\bPBFT\b": "P B F T",
    r"\bUTXOs\b": "U T X O's",
    r"\bUTXO\b": "U T X O",
    r"\bCRDTs\b": "C R D T's",
    r"\bCRDT\b": "C R D T",
    r"\bDHTs\b": "D H T's",
    r"\bDHT\b": "D H T",
    r"\bDAG\b": "dag",
    r"\bRPCs\b": "R P C's",
    r"\bFIND_NODE\b": "find node",
    r"\bFIND_VALUE\b": "find value",
    r"\bNEW_LEADER\b": "new leader",
    r"\bSTORE\b": "store",
    r"\bPING\b": "ping",
    r"\bk-buckets?\b": lambda m: m.group(0).replace("k-", "kay "),
    r"\bFLP\b": "F L P",
    r"\bOT\b": "O T",
    r"\bEOS\b": "E O S",
    r"\bNAT\b": "nat",
    r"\bLSEQ\b": "L seek",
    r"\b2026\b": "twenty twenty six",
    r"\b2025\b": "twenty twenty five",
}

SAMPLE_RATE = 24000


def spoken(text: str) -> str:
    for pattern, repl in PRONUNCIATIONS.items():
        text = re.sub(pattern, repl, text)
    return text


def paragraphs(script: str):
    """Yield (kind, text) with kind in {"title", "heading", "para"}."""
    for block in re.split(r"\n\s*\n", script.strip()):
        block = block.strip()
        if not block:
            continue
        if block.startswith("# "):
            yield "title", block[2:].strip()
        elif block.startswith("## "):
            yield "heading", block[3:].strip()
        else:
            # Lines inside one block are separate sentences in a list.
            for line in block.splitlines():
                line = line.strip()
                if line:
                    yield "para", line


def split_long(text: str, limit: int = 350):
    """Kokoro handles up to ~510 phoneme tokens; keep chunks to a few sentences."""
    sentences = re.split(r"(?<=[.!?])\s+", text)
    chunk = ""
    for s in sentences:
        if chunk and len(chunk) + len(s) > limit:
            yield chunk
            chunk = s
        else:
            chunk = f"{chunk} {s}".strip()
    if chunk:
        yield chunk


def silence(seconds: float):
    return np.zeros(int(SAMPLE_RATE * seconds), dtype=np.float32)


def render(kokoro: Kokoro, script_path: Path, out_path: Path, voice: str, speed: float):
    pieces = []
    for kind, text in paragraphs(script_path.read_text(encoding="utf-8")):
        if kind == "heading":
            pieces.append(silence(0.8))
        for chunk in split_long(spoken(text)):
            audio, sr = kokoro.create(chunk, voice=voice, speed=speed, lang="en-us")
            assert sr == SAMPLE_RATE
            pieces.append(audio.astype(np.float32))
            pieces.append(silence(0.25))
        pieces.append(silence(1.0 if kind != "para" else 0.45))
    wav_path = out_path.with_suffix(".wav")
    sf.write(wav_path, np.concatenate(pieces), SAMPLE_RATE)
    subprocess.run(
        ["ffmpeg", "-y", "-loglevel", "error", "-i", str(wav_path),
         "-ac", "1", "-codec:a", "libmp3lame", "-b:a", "64k",
         "-metadata", f"title={script_path.stem}",
         "-metadata", "album=D7024E exam audio", str(out_path)],
        check=True,
    )
    wav_path.unlink()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("prefix", nargs="?", default="")
    ap.add_argument("--voice", default="am_michael")
    ap.add_argument("--speed", type=float, default=1.0)
    ap.add_argument("--models", default=str(HERE / "models"))
    args = ap.parse_args()

    models = Path(args.models)
    kokoro = Kokoro(str(models / "kokoro-v1.0.onnx"), str(models / "voices-v1.0.bin"))
    out_dir = HERE / "mp3"
    out_dir.mkdir(exist_ok=True)
    scripts = sorted(p for p in (HERE / "scripts").glob("*.md") if p.stem.startswith(args.prefix))
    if not scripts:
        sys.exit(f"no scripts match {args.prefix!r}")
    for script in scripts:
        out = out_dir / f"{script.stem}.mp3"
        print(f"rendering {script.name} -> {out.relative_to(HERE.parent)}", flush=True)
        render(kokoro, script, out, args.voice, args.speed)


if __name__ == "__main__":
    main()
