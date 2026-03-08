#!/usr/bin/env python3
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
BOOKLET_DIR = ROOT / "booklet"
OUTPUT = ROOT / "docs" / "data" / "chapters.json"
CHANT_GLOB_ORDER = ("m*.tex", "e*.tex", "s*.tex")
CHANT_FILES = [
    path
    for pattern in CHANT_GLOB_ORDER
    for path in sorted(BOOKLET_DIR.glob(pattern), key=lambda candidate: candidate.name)
]

TITLE_RE = re.compile(r"\\section\*\{([^}]*)\}")
TITLE_EN_RE = re.compile(r"^\s*%\s*title-en:\s*(.+?)\s*$", re.M)
SUBSECTION_RE = re.compile(
    r"\\begin\{chantsubsection\}(.*?)\\end\{chantsubsection\}", re.S
)
STYLE_BLOCK_RE = re.compile(r"\{\\englishstyle(?:\\textit)?\s*(.*?)\}", re.S)


@dataclass
class RawToken:
    kind: str
    args: list[str]


@dataclass
class Entry:
    kind: str
    pali: str
    english: str = ""


def strip_comments(text: str) -> str:
    cleaned: list[str] = []
    for line in text.splitlines():
        output: list[str] = []
        escape = False
        for char in line:
            if char == "%" and not escape:
                break
            output.append(char)
            escape = char == "\\"
        cleaned.append("".join(output))
    return "\n".join(cleaned)


def collapse_whitespace(text: str) -> str:
    text = text.replace("\n", " ")
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def unwrap_simple_commands(text: str) -> str:
    pattern = re.compile(r"\\(?:textit|emph|textbf|englishstyle|palistyle)\s*\{([^{}]*)\}")
    previous = None
    while text != previous:
        previous = text
        text = pattern.sub(r"\1", text)
    return text


def clean_text(text: str) -> str:
    text = text.strip()
    text = re.sub(r"\\footnote\s*\{.*?\}", "", text, flags=re.S)
    text = text.replace(r"\{", "{").replace(r"\}", "}")
    text = text.replace("~", " ")
    text = re.sub(r"\\(?:par|newpage|clearpage)\b", " ", text)
    text = re.sub(r"\\;+", " ", text)
    text = unwrap_simple_commands(text)
    text = text.replace("|", ":")
    text = re.sub(r"\\[A-Za-z@]+\*?(?:\s*\[[^\]]*\])?", " ", text)
    text = text.replace("{", "").replace("}", "")
    text = collapse_whitespace(text)
    text = re.sub(r"\s+([,.;:?!])", r"\1", text)
    text = text.replace("``", '"').replace("''", '"')
    return text.strip()


def infer_short_code(path: Path) -> str:
    stem = path.stem
    return stem.split("-", 1)[0]


def normalize_identifier(text: str) -> str:
    text = text.replace(r"\&", "-")
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9]+", "-", text)
    return re.sub(r"-+", "-", text).strip("-")


def read_braced(text: str, start: int) -> tuple[str, int]:
    if start >= len(text) or text[start] != "{":
        raise ValueError(f"Expected '{{' at offset {start}")

    depth = 0
    buffer: list[str] = []
    i = start
    while i < len(text):
        char = text[i]
        if char == "\\" and i + 1 < len(text) and text[i + 1] in "{}":
            buffer.append(char)
            buffer.append(text[i + 1])
            i += 2
            continue
        if char == "{":
            depth += 1
            if depth > 1:
                buffer.append(char)
        elif char == "}":
            depth -= 1
            if depth == 0:
                return "".join(buffer), i + 1
            buffer.append(char)
        else:
            buffer.append(char)
        i += 1
    raise ValueError("Unbalanced braces in TeX input")


def tokenize_subsection(body: str) -> list[RawToken]:
    tokens: list[RawToken] = []
    command_arity = {
        "chantline": 2,
        "chantlineinline": 2,
        "chantlinepair": 3,
        "chantonly": 1,
        "chantonlyinline": 1,
        "chantnote": 1,
        "chantnotetrans": 1,
        "chantindent": 1,
    }

    i = 0
    while i < len(body):
        if body[i].isspace():
            i += 1
            continue

        if body[i] == "\\":
            j = i + 1
            while j < len(body) and (body[j].isalpha() or body[j] in "*@"):
                j += 1
            name = body[i + 1 : j]

            if name in {"par", "chantgap", "newpage", "clearpage"}:
                i = j
                continue

            if name in command_arity:
                args: list[str] = []
                cursor = j
                for _ in range(command_arity[name]):
                    while cursor < len(body) and body[cursor].isspace():
                        cursor += 1
                    if cursor >= len(body) or body[cursor] != "{":
                        raise ValueError(f"Missing brace argument for \\{name}")
                    value, cursor = read_braced(body, cursor)
                    args.append(value)
                tokens.append(RawToken(name, args))
                i = cursor
                continue

            i = j
            continue

        if body[i] == "{" and body.startswith("{\\englishstyle", i):
            block, i = read_braced(body, i)
            tokens.append(RawToken("english_block", [block]))
            continue

        i += 1

    return tokens


def is_instruction(text: str) -> bool:
    lowered = text.lower()
    return text.startswith("---") or "bow" in lowered or lowered.startswith("end of")


def is_prompt_like(text: str) -> bool:
    lowered = text.lower()
    return lowered.startswith("handa") or "{" in text or "now let us" in lowered


def is_transliteration(text: str) -> bool:
    stripped = text.strip()
    return stripped.startswith("(") and stripped.endswith(")")


def classify_chantnote(text: str) -> str:
    if is_instruction(text) or is_prompt_like(text):
        return "note"
    return "line"


def looks_english(text: str) -> bool:
    ascii_letters = sum(char.isascii() and char.isalpha() for char in text)
    total_letters = sum(char.isalpha() for char in text)
    if ascii_letters == 0 or total_letters == 0:
        return False
    if ascii_letters / total_letters < 0.9:
        return False
    common_words = {
        "the",
        "and",
        "to",
        "of",
        "is",
        "are",
        "may",
        "with",
        "this",
        "that",
        "for",
        "from",
        "in",
        "our",
        "my",
        "not",
        "now",
    }
    words = re.findall(r"[A-Za-z']+", text.lower())
    return any(word in common_words for word in words)


def attach_translation_target(entries: list[Entry]) -> Entry | None:
    for entry in reversed(entries):
        if entry.english:
            continue
        if entry.kind == "note" and is_prompt_like(entry.pali):
            return entry
    for entry in reversed(entries):
        if not entry.english:
            return entry
    return None


def normalize_subsection(tokens: Iterable[RawToken]) -> list[Entry]:
    entries: list[Entry] = []

    for token in tokens:
        if token.kind in {"chantline", "chantlineinline"}:
            pali = clean_text(token.args[0])
            english = clean_text(token.args[1]) if len(token.args) > 1 else ""
            if pali:
                kind = "note" if is_instruction(pali) or is_prompt_like(pali) else "line"
                entries.append(Entry(kind=kind, pali=pali, english=english))
            continue

        if token.kind == "chantlinepair":
            pali = clean_text(f"{token.args[0]} {token.args[1]}")
            english = clean_text(token.args[2])
            if pali:
                entries.append(Entry(kind="line", pali=pali, english=english))
            continue

        if token.kind in {"chantonly", "chantonlyinline"}:
            pali = clean_text(token.args[0])
            if pali:
                entries.append(Entry(kind="line", pali=pali, english=""))
            continue

        if token.kind == "chantnote":
            text = clean_text(token.args[0])
            if not text:
                continue
            if looks_english(text) and not is_instruction(text):
                target = attach_translation_target(entries)
                if target is not None:
                    target.english = text
                    continue
            if text.startswith("The ") and entries:
                target = attach_translation_target(entries)
                if target is not None:
                    target.english = text
                    continue
            entries.append(Entry(kind=classify_chantnote(text), pali=text, english=""))
            continue

        if token.kind == "chantnotetrans":
            text = clean_text(token.args[0])
            if not text:
                continue
            target = attach_translation_target(entries)
            if target is not None:
                target.english = f"{target.english} {text}".strip()
            else:
                entries.append(Entry(kind="note", pali="", english=text))
            continue

        if token.kind == "chantindent":
            text = clean_text(token.args[0])
            if not text or is_transliteration(text):
                continue
            target = attach_translation_target(entries)
            if target is not None:
                target.english = f"{target.english} {text}".strip()
            continue

        if token.kind == "english_block":
            text = clean_text(token.args[0])
            if text:
                entries.append(Entry(kind="footer", pali="", english=text))

    filtered: list[Entry] = []
    for entry in entries:
        if entry.kind == "footer" and not entry.english:
            continue
        if not entry.pali and not entry.english:
            continue
        filtered.append(entry)
    return filtered


def parse_footer_notes(text: str) -> list[str]:
    remainder = SUBSECTION_RE.sub("", text)
    notes: list[str] = []
    for match in STYLE_BLOCK_RE.finditer(remainder):
        cleaned = clean_text(match.group(1))
        if cleaned:
            notes.append(cleaned)
    return notes


def parse_chapter(path: Path) -> dict:
    source_text = path.read_text(encoding="utf-8")
    title_english_match = TITLE_EN_RE.search(source_text)
    raw = strip_comments(source_text)
    title_match = TITLE_RE.search(raw)
    if title_match is None:
        raise ValueError(f"Missing section title in {path.name}")

    raw_title = title_match.group(1).strip()
    if "|" in raw_title:
        raw_short_code, raw_chapter_title = raw_title.split("|", 1)
        short_code = clean_text(raw_short_code)
        title = clean_text(raw_chapter_title)
    else:
        short_code = infer_short_code(path)
        title = clean_text(raw_title)
    title_english = clean_text(title_english_match.group(1)) if title_english_match else title

    chapter_id = normalize_identifier(short_code) or normalize_identifier(path.stem)
    subsections = []
    entry_index = 0

    for subsection_body in SUBSECTION_RE.findall(raw):
        tokens = tokenize_subsection(subsection_body)
        entries = []
        for entry in normalize_subsection(tokens):
            if entry.kind == "footer":
                continue
            entry_index += 1
            entries.append(
                {
                    "id": f"{chapter_id}-{entry_index}",
                    "kind": entry.kind,
                    "pali": entry.pali,
                    "english": entry.english,
                }
            )
        if entries:
            subsections.append({"entries": entries})

    return {
        "id": chapter_id,
        "title": title,
        "titleEnglish": title_english,
        "source": str(path.relative_to(ROOT)),
        "footerNotes": parse_footer_notes(raw),
        "subsections": subsections,
    }


def main() -> None:
    chapters = [parse_chapter(path) for path in CHANT_FILES]
    payload = {"chapters": chapters}
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {OUTPUT.relative_to(ROOT)} with {len(chapters)} chapters.")


if __name__ == "__main__":
    main()
