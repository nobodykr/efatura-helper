#!/usr/bin/env python3
"""Check and clean the metadata of every file we hand to someone.

Canonical copy: homelab-infra `tools/export_metadata/export_metadata.py`. Repos vendor this file
unchanged and pin its sha256 in a test (see README.md). Standard library only.

Policy (proposed 10/10/2026, feature `export-metadata`): a delivered file carries only a title, the
brand as author (and as PDF Creator/Producer), a creation date-time, the language and, where the
producing app has an audit log, an opaque export reference. Tool names and versions, paths,
hostnames, internal IDs, usernames, editing history, comments, EXIF and editor metadata are removed.

    python3 export_metadata.py check --brand empresadb FILE...
    python3 export_metadata.py scrub --brand empresadb [--title T] [--lang pt-PT] FILE...

`check` reads raw bytes, never a tool's view of the latest revision, and fails closed on PDF
features it cannot fully parse (incremental updates, xref streams, object streams, encryption).
`scrub` rewrites only metadata: PDF Info and XMP, PNG/JPEG metadata chunks, SVG comments,
`<metadata>`, editor namespaces and `data-*` attributes. Pixels and page content are untouched.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import re
import sys
import tempfile
import zipfile
import zlib
from datetime import datetime, timezone
from xml.etree import ElementTree as ET

# One place for the Author wording. Pending Diogo's choice (10/10/2026); change here only.
BRANDS = {
    "empresadb": "empresadb",
    "consultancy": "Diogo Andrade",
    "fiscalidade": "Fiscalidade",
}

LEAK_PATTERNS = [
    (re.compile(rb"file://", re.I), "file URL"),
    (re.compile(rb"/mnt/data|/home/[a-z_]|/tmp/|/var/lib/|/Users/[A-Za-z]|[A-Z]:\\\\Users"), "filesystem path"),
    (re.compile(rb"\blocalhost\b|\b127\.0\.0\.1\b|\b0\.0\.0\.0\b"), "loopback host"),
    (re.compile(rb"\.lab\.d1060\.com|\bhomeserver\b", re.I), "private hostname"),
    (re.compile(rb"\b100\.(?:6[4-9]|[7-9]\d|1[01]\d|12[0-7])\.\d{1,3}\.\d{1,3}\b"), "tailnet address"),
]


def brand_value(brand: str | None) -> str | None:
    if brand is None:
        return None
    return BRANDS.get(brand, brand)


def leaks(data: bytes, where: str) -> list[str]:
    return [f"{where}: {label}" for rx, label in LEAK_PATTERNS if rx.search(data)]


def _atomic_write(path: str, data: bytes) -> None:
    folder = os.path.dirname(os.path.abspath(path))
    fd, tmp = tempfile.mkstemp(dir=folder, prefix=".export-metadata-")
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(data)
        os.chmod(tmp, os.stat(path).st_mode & 0o777)
        os.replace(tmp, path)
    except BaseException:
        if os.path.exists(tmp):
            os.unlink(tmp)
        raise


# ---------------------------------------------------------------------------------------------
# PDF: a minimal reader for single-revision files with a classic xref table.

class PdfUnsupported(ValueError):
    pass


_WS = b" \t\r\n\f\x00"
_DELIM = b"()<>[]{}/%"


def _skip_ws(buf: bytes, i: int) -> int:
    while i < len(buf):
        if buf[i] in _WS:
            i += 1
        elif buf[i:i + 1] == b"%":
            while i < len(buf) and buf[i] not in b"\r\n":
                i += 1
        else:
            break
    return i


def _parse_literal(buf: bytes, i: int) -> tuple[bytes, int]:
    out, depth, i = bytearray(), 1, i + 1
    escapes = {b"n": b"\n", b"r": b"\r", b"t": b"\t", b"b": b"\b", b"f": b"\f"}
    while i < len(buf):
        c = buf[i:i + 1]
        if c == b"\\":
            n = buf[i + 1:i + 2]
            if n in escapes:
                out += escapes[n]
                i += 2
            elif n.isdigit():
                j = i + 1
                while j < len(buf) and j < i + 4 and buf[j:j + 1].isdigit():
                    j += 1
                out.append(int(buf[i + 1:j], 8) & 0xFF)
                i = j
            elif n in b"\r\n":
                i += 3 if buf[i + 1:i + 3] == b"\r\n" else 2
            else:
                out += n
                i += 2
            continue
        if c == b"(":
            depth += 1
        elif c == b")":
            depth -= 1
            if depth == 0:
                return bytes(out), i + 1
        out += c
        i += 1
    raise PdfUnsupported("unterminated string")


def _parse(buf: bytes, i: int):
    """Parse one PDF object at i. Returns (value, end). Strings come back as bytes."""
    i = _skip_ws(buf, i)
    c = buf[i:i + 1]
    if buf[i:i + 2] == b"<<":
        d, i = {}, i + 2
        while True:
            i = _skip_ws(buf, i)
            if buf[i:i + 2] == b">>":
                return d, i + 2
            key, i = _parse(buf, i)
            if not isinstance(key, Name):
                raise PdfUnsupported("dictionary key is not a name")
            d[key], i = _parse(buf, i)
    if c == b"<":
        j = buf.index(b">", i)
        raw = re.sub(rb"\s", b"", buf[i + 1:j])
        if len(raw) % 2:
            raw += b"0"
        return bytes.fromhex(raw.decode()), j + 1
    if c == b"(":
        return _parse_literal(buf, i)
    if c == b"[":
        arr, i = [], i + 1
        while True:
            i = _skip_ws(buf, i)
            if buf[i:i + 1] == b"]":
                return arr, i + 1
            v, i = _parse(buf, i)
            arr.append(v)
    if c == b"/":
        j = i + 1
        while j < len(buf) and buf[j] not in _WS and buf[j] not in _DELIM:
            j += 1
        name = re.sub(rb"#([0-9A-Fa-f]{2})", lambda m: bytes([int(m.group(1), 16)]), buf[i + 1:j])
        return Name(name.decode("latin-1")), j
    m = re.compile(rb"(\d+)\s+(\d+)\s+R\b").match(buf, i)
    if m:
        return Ref(int(m.group(1))), m.end()
    m = re.compile(rb"[+-]?\d*\.?\d+|true|false|null").match(buf, i)
    if m:
        return m.group(0), m.end()
    raise PdfUnsupported(f"cannot parse object at byte {i}")


class Name(str):
    pass


class Ref(int):
    pass


def _text(value) -> str:
    if not isinstance(value, bytes):
        return str(value)
    if value.startswith(b"\xfe\xff"):
        return value[2:].decode("utf-16-be", "replace")
    if value.startswith(b"\xef\xbb\xbf"):
        return value[3:].decode("utf-8", "replace")
    return value.decode("latin-1")


class Pdf:
    """Single-revision PDF with a classic xref table. Anything else raises PdfUnsupported."""

    def __init__(self, data: bytes):
        self.data = data
        if not data.startswith(b"%PDF-"):
            raise PdfUnsupported("not a PDF")
        if b"/Encrypt" in data:
            raise PdfUnsupported("encrypted PDF")
        if re.search(rb"/Type\s*/ObjStm", data):
            raise PdfUnsupported("object streams")
        if re.search(rb"/Type\s*/XRef\b", data):
            raise PdfUnsupported("xref stream")
        if data.count(b"startxref") != 1 or len(re.findall(rb"%%EOF", data)) != 1:
            raise PdfUnsupported("more than one revision (incremental update or linearized)")
        m = re.search(rb"startxref\s+(\d+)\s+%%EOF\s*$", data)
        if not m:
            raise PdfUnsupported("trailer not at end of file")
        self.startxref_pos = m.start(1)
        self.xref_pos = int(m.group(1))
        if data[self.xref_pos:self.xref_pos + 4] != b"xref":
            raise PdfUnsupported("startxref does not point to an xref table")
        self.offsets: dict[int, int] = {}
        self.entry_pos: dict[int, int] = {}
        i = self.xref_pos + 4
        while True:
            i = _skip_ws(data, i)
            if data[i:i + 7] == b"trailer":
                break
            sm = re.compile(rb"(\d+)\s+(\d+)\s*?\r?\n").match(data, i)
            if not sm:
                raise PdfUnsupported("bad xref subsection")
            start, count = int(sm.group(1)), int(sm.group(2))
            i = sm.end()
            for n in range(count):
                entry = data[i:i + 20]
                em = re.match(rb"(\d{10}) (\d{5}) ([nf])", entry)
                if not em:
                    raise PdfUnsupported("bad xref entry")
                if em.group(3) == b"n":
                    self.offsets[start + n] = int(em.group(1))
                    self.entry_pos[start + n] = i
                i += 20
        self.trailer, _ = _parse(data, i + 7)
        if Name("Prev") in self.trailer:
            raise PdfUnsupported("incremental update (/Prev)")

    def object_span(self, num: int) -> tuple[int, int]:
        """Byte span of the object's value (between `obj` and `endobj`, stream included)."""
        off = self.offsets[num]
        m = re.compile(rb"%d\s+\d+\s+obj" % num).match(self.data, off)
        if not m:
            raise PdfUnsupported(f"xref offset for object {num} is wrong")
        end = self.data.index(b"endobj", m.end())
        return m.end(), end

    def get(self, num: int):
        start, _ = self.object_span(num)
        value, _ = _parse(self.data, start)
        return value

    def resolve(self, value):
        return self.get(value) if isinstance(value, Ref) else value

    def stream(self, num: int) -> tuple[dict, int, int]:
        """(dict, data_start, data_end) of a stream object."""
        start, end = self.object_span(num)
        d, i = _parse(self.data, start)
        m = re.compile(rb"\s*stream\r?\n").match(self.data, i)
        if not m:
            raise PdfUnsupported(f"object {num} is not a stream")
        length = int(self.resolve(d[Name("Length")]))
        return d, m.end(), m.end() + length

    def all_objects(self):
        for num in sorted(self.offsets):
            yield num, *self.object_span(num)


XMP_ALLOWED = {
    "http://purl.org/dc/elements/1.1/": {"title", "creator", "language", "format"},
    "http://ns.adobe.com/xap/1.0/": {"CreateDate", "CreatorTool"},
    "http://ns.adobe.com/pdf/1.3/": {"Producer"},
    # Conformance claims a standard requires (PDF/A, PDF/UA); structural, not personal.
    "http://www.aiim.org/pdfa/ns/id/": {"part", "conformance", "amd", "rev"},
    "http://www.aiim.org/pdfua/ns/id/": {"part"},
}
RDF = "http://www.w3.org/1999/02/22-rdf-syntax-ns#"
XNS = "adobe:ns:meta/"
INFO_ALLOWED = {"Title", "Author", "Creator", "Producer", "CreationDate"}
PDF_FORBIDDEN_KEYS = {
    "PieceInfo": "editing history (PieceInfo)",
    "EmbeddedFiles": "embedded files",
    "EmbeddedFile": "embedded files",
    "JavaScript": "JavaScript",
    "OCProperties": "optional content (hidden layers)",
}


def _xmp_values(xml: bytes) -> tuple[dict[str, list[str]], list[str]]:
    """Property name -> text values, plus violations found while walking the packet."""
    problems, values = [], {}
    xml = re.sub(rb"<\?xpacket[^>]*\?>", b"", xml).strip()
    try:
        root = ET.fromstring(xml)
    except ET.ParseError as exc:
        return {}, [f"XMP is not parseable ({exc})"]
    for attr in root.attrib:
        problems.append(f"XMP: x:xmpmeta attribute {attr.split('}')[-1]} (tool name)")
    for desc in root.iter(f"{{{RDF}}}Description"):
        props = [(k, v) for k, v in desc.attrib.items() if not k.startswith(f"{{{RDF}}}")]
        props += [(child.tag, None) for child in desc]
        for tag, attr_value in props:
            ns, _, local = tag[1:].partition("}") if tag.startswith("{") else ("", "", tag)
            if local not in XMP_ALLOWED.get(ns, set()):
                problems.append(f"XMP: {local} ({ns or 'no namespace'}) is not allowed")
                continue
            if attr_value is not None:
                texts = [attr_value]
            else:
                node = next(child for child in desc if child.tag == tag)
                texts = [t.strip() for t in node.itertext() if t.strip()]
            values[local] = texts
    return values, problems


def check_pdf(data: bytes, brand: str | None = None) -> list[str]:
    try:
        pdf = Pdf(data)
    except PdfUnsupported as exc:
        return [f"PDF structure not supported by the checker: {exc}"]
    except (ValueError, KeyError, IndexError) as exc:
        return [f"PDF not parseable: {exc}"]
    problems: list[str] = []
    want = brand_value(brand)
    info_ref = pdf.trailer.get(Name("Info"))
    root = pdf.resolve(pdf.trailer[Name("Root")])
    meta_ref = root.get(Name("Metadata")) if isinstance(root, dict) else None

    # Info dictionary: allowlist and positive values.
    info = pdf.resolve(info_ref) if info_ref is not None else {}
    if not isinstance(info, dict):
        problems.append("Info is not a dictionary")
        info = {}
    for key in info:
        if key not in INFO_ALLOWED:
            problems.append(f"Info: {key} is not allowed")
    title = _text(pdf.resolve(info.get(Name("Title"), b""))).strip()
    if not title:
        problems.append("Info: Title is missing or empty")
    if Name("CreationDate") not in info:
        problems.append("Info: CreationDate is missing")
    for key in ("Author", "Creator", "Producer"):
        value = _text(pdf.resolve(info.get(Name(key), b""))).strip()
        if want is not None and value != want:
            problems.append(f"Info: {key} is {value!r}, expected the brand {want!r}")
        elif want is None and value not in BRANDS.values():
            problems.append(f"Info: {key} is {value!r}, not a brand value")

    # XMP: only the packet the catalog points at, and only allowlisted properties.
    xmp_spans = []
    if meta_ref is not None:
        d, s, e = pdf.stream(int(meta_ref))
        if d.get(Name("Filter")) is not None:
            problems.append("XMP stream is compressed (cannot be reviewed in place)")
        else:
            xmp_spans.append((s, e))
            values, xmp_problems = _xmp_values(data[s:e])
            problems += xmp_problems
            for key in ("creator", "CreatorTool", "Producer"):
                for value in values.get(key, []):
                    if want is not None and value != want:
                        problems.append(f"XMP: {key} is {value!r}, expected the brand {want!r}")
            problems += leaks(data[s:e], "XMP")

    # Every object: forbidden structures, stray metadata, leaks in dictionaries, embedded JPEGs.
    info_num = int(info_ref) if info_ref is not None else None
    for num, start, end in pdf.all_objects():
        body = data[start:end]
        m = re.search(rb"\bstream\r?\n", body)
        head = body[:m.start()] if m else body
        if num != info_num and re.search(rb"/(Producer|Creator|ModDate|CreationDate|Author)\b", head):
            problems.append(f"object {num}: stray document-information keys")
        for key, label in PDF_FORBIDDEN_KEYS.items():
            if re.search(rb"/" + key.encode() + rb"\b", head):
                problems.append(f"object {num}: {label}")
        if re.search(rb"/Subtype\s*/(Text|Popup|FileAttachment)\b", head):
            problems.append(f"object {num}: comment or attachment annotation")
        problems += leaks(head, f"object {num}")
        if m and not any(s <= start + m.end() < e for s, e in xmp_spans):
            if b"<x:xmpmeta" in body or b"<?xpacket" in body:
                problems.append(f"object {num}: XMP packet outside the document metadata")
            if re.search(rb"/Filter\s*/DCTDecode\b", head):
                try:
                    d, s, e = pdf.stream(num)
                    problems += [f"object {num} (embedded JPEG): {p}" for p in check_jpeg(data[s:e])]
                except (PdfUnsupported, KeyError, ValueError):
                    problems.append(f"object {num}: embedded JPEG not readable")
            elif re.search(rb"/Filter\s*/FlateDecode\b", head) and not re.search(rb"/Subtype\s*/Image\b", head):
                try:
                    d, s, e = pdf.stream(num)
                    inflated = zlib.decompress(data[s:e])
                except (PdfUnsupported, KeyError, ValueError, zlib.error):
                    continue
                if b"<x:xmpmeta" in inflated:
                    problems.append(f"object {num}: compressed XMP packet")
    return problems


def _pdf_string(value: str) -> bytes:
    try:
        raw = value.encode("ascii")
        if all(32 <= b < 127 for b in raw):
            return b"(" + raw.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)") + b")"
    except UnicodeEncodeError:
        pass
    return b"<FEFF" + value.encode("utf-16-be").hex().upper().encode() + b">"


def _lisbon(dt: datetime) -> datetime:
    try:
        from zoneinfo import ZoneInfo
        return dt.astimezone(ZoneInfo("Europe/Lisbon"))
    except Exception:  # no tz database in a slim image: keep the producer's offset
        return dt


def _parse_pdf_date(value: str) -> datetime | None:
    m = re.match(r"D:(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})(Z|[+-]\d{2}'?\d{2}'?)?", value)
    if not m:
        return None
    tz = m.group(7) or "Z"
    if tz == "Z":
        offset = timezone.utc
    else:
        sign = -1 if tz[0] == "-" else 1
        hh, mm = int(tz[1:3]), int(tz.replace("'", "")[3:5] or 0)
        from datetime import timedelta
        offset = timezone(sign * timedelta(hours=hh, minutes=mm))
    return datetime(*(int(m.group(k)) for k in range(1, 7)), tzinfo=offset)


def _pdf_date(dt: datetime) -> str:
    off = dt.utcoffset()
    total = int(off.total_seconds() // 60) if off is not None else 0
    sign = "-" if total < 0 else "+"
    return dt.strftime("D:%Y%m%d%H%M%S") + f"{sign}{abs(total) // 60:02d}'{abs(total) % 60:02d}'"


def _splice(data: bytes, start: int, end: int, new: bytes) -> bytes:
    """Replace data[start:end] and shift every later xref offset (single classic xref table)."""
    pdf = Pdf(data)
    delta = len(new) - (end - start)
    out = bytearray(data[:start] + new + data[end:])
    if delta == 0:
        return bytes(out)
    for num, pos in pdf.entry_pos.items():
        off = pdf.offsets[num]
        if off > start:
            p = pos + delta if pos > start else pos
            out[p:p + 10] = b"%010d" % (off + delta)
    sx = pdf.startxref_pos + delta
    m = re.compile(rb"\d+").match(out, sx)
    out[m.start():m.end()] = str(pdf.xref_pos + delta).encode()
    return bytes(out)


def _xmp_packet(title: str, author: str, lang: str | None, created: datetime) -> bytes:
    from xml.sax.saxutils import escape
    lang_xml = f"<dc:language><rdf:Bag><rdf:li>{escape(lang)}</rdf:li></rdf:Bag></dc:language>" if lang else ""
    body = (
        '<?xpacket begin="" id="W5M0MpCehiHzreSzNTczkc9d"?>'
        '<x:xmpmeta xmlns:x="adobe:ns:meta/"><rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">'
        '<rdf:Description rdf:about="" xmlns:dc="http://purl.org/dc/elements/1.1/" '
        'xmlns:xmp="http://ns.adobe.com/xap/1.0/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/">'
        f'<dc:format>application/pdf</dc:format>'
        f'<dc:title><rdf:Alt><rdf:li xml:lang="x-default">{escape(title)}</rdf:li></rdf:Alt></dc:title>'
        f'<dc:creator><rdf:Seq><rdf:li>{escape(author)}</rdf:li></rdf:Seq></dc:creator>{lang_xml}'
        f'<xmp:CreateDate>{created.isoformat(timespec="seconds")}</xmp:CreateDate>'
        f'<xmp:CreatorTool>{escape(author)}</xmp:CreatorTool><pdf:Producer>{escape(author)}</pdf:Producer>'
        '</rdf:Description></rdf:RDF></x:xmpmeta>'
    )
    return body.encode("utf-8")


def _scrub_pdf_jpegs(data: bytes) -> bytes:
    """Drop EXIF, IPTC and comments from embedded JPEGs. The PDF places the image with its own matrix,
    so the JPEG's Orientation tag is not read by viewers and removing it changes nothing on the page."""
    while True:
        pdf = Pdf(data)
        for num, start, end in pdf.all_objects():
            head = data[start:end].split(b"stream", 1)[0]
            if not re.search(rb"/Filter\s*/DCTDecode\b", head):
                continue
            d, s, e = pdf.stream(num)
            if not check_jpeg(data[s:e]):
                continue
            if isinstance(d.get(Name("Length")), Ref):
                raise PdfUnsupported(f"object {num}: JPEG with metadata and an indirect /Length")
            clean = scrub_jpeg(data[s:e])
            dict_end = re.compile(rb"\s*stream\r?\n").search(data, start).start()
            new_dict = re.sub(rb"/Length\s+\d+", b"/Length %d" % len(clean), data[start:dict_end], count=1)
            data = _splice(data, start, e, new_dict + data[dict_end:s] + clean)
            break
        else:
            return data


def scrub_pdf(data: bytes, brand: str, title: str | None = None, lang: str | None = None,
              created: datetime | None = None) -> bytes:
    """Rewrite the Info dictionary and the XMP packet; nothing else changes."""
    author = brand_value(brand)
    pdf = Pdf(data)
    info_ref = pdf.trailer.get(Name("Info"))
    if info_ref is None:
        raise PdfUnsupported("no Info dictionary to rewrite")
    info = pdf.get(int(info_ref))
    title = title if title is not None else _text(pdf.resolve(info.get(Name("Title"), b""))).strip()
    if not title:
        raise ValueError("a title is required (pass --title)")
    if created is None:
        created = _parse_pdf_date(_text(pdf.resolve(info.get(Name("CreationDate"), b"")))) \
            or datetime.now(timezone.utc)
    created = _lisbon(created)
    new_info = b"\n<</Title %s /Author %s /Creator %s /Producer %s /CreationDate %s>>\n" % (
        _pdf_string(title), _pdf_string(author), _pdf_string(author), _pdf_string(author),
        _pdf_string(_pdf_date(created)))
    start, end = pdf.object_span(int(info_ref))
    data = _splice(data, start, end, new_info)

    pdf = Pdf(data)
    root_num = int(pdf.trailer[Name("Root")])
    root = pdf.get(root_num)
    if lang is None and Name("Lang") in root:
        lang = _text(pdf.resolve(root[Name("Lang")]))
    if lang and Name("Lang") not in root:
        start, end = pdf.object_span(root_num)
        body = data[start:end]
        at = body.index(b"<<") + 2
        data = _splice(data, start, end, body[:at] + b"/Lang " + _pdf_string(lang) + b" " + body[at:])
        pdf = Pdf(data)
        root = pdf.get(root_num)
    meta_ref = root.get(Name("Metadata"))
    if meta_ref is not None:
        d, s, e = pdf.stream(int(meta_ref))
        if d.get(Name("Filter")) is not None:
            raise PdfUnsupported("compressed XMP stream")
        packet = _xmp_packet(title, author, lang, created)
        tail = b'<?xpacket end="w"?>'
        room = (e - s) - len(packet) - len(tail)
        if room < 0:
            raise PdfUnsupported("new XMP packet does not fit the existing stream")
        # Same length: the xpacket padding is whitespace by design, so no offset moves.
        data = data[:s] + packet + b"\n" * min(room, 1) + b" " * max(room - 1, 0) + tail + data[e:]
    data = _scrub_pdf_jpegs(data)
    problems = check_pdf(data, brand)
    if problems:
        raise ValueError("scrubbed PDF still fails: " + "; ".join(problems))
    return data


# ---------------------------------------------------------------------------------------------
# Images

PNG_SIG = b"\x89PNG\r\n\x1a\n"
PNG_KEEP = {b"IHDR", b"PLTE", b"IDAT", b"IEND", b"tRNS", b"gAMA", b"cHRM", b"sRGB", b"iCCP",
            b"pHYs", b"sBIT", b"bKGD", b"hIST", b"acTL", b"fcTL", b"fdAT"}


def _png_chunks(data: bytes):
    if not data.startswith(PNG_SIG):
        raise ValueError("not a PNG")
    i = 8
    while i < len(data):
        length = int.from_bytes(data[i:i + 4], "big")
        yield data[i + 4:i + 8], data[i:i + 12 + length]
        i += 12 + length


def check_png(data: bytes) -> list[str]:
    return [f"PNG chunk {kind.decode('latin-1')} is not allowed"
            for kind, _ in _png_chunks(data) if kind not in PNG_KEEP]


def scrub_png(data: bytes) -> bytes:
    return PNG_SIG + b"".join(chunk for kind, chunk in _png_chunks(data) if kind in PNG_KEEP)


def _jpeg_segments(data: bytes):
    if not data.startswith(b"\xff\xd8"):
        raise ValueError("not a JPEG")
    i = 2
    while i < len(data):
        if data[i] != 0xFF:
            raise ValueError("bad JPEG marker")
        marker = data[i + 1]
        if marker == 0xDA:  # start of scan: the rest is image data
            yield marker, data[i:]
            return
        length = int.from_bytes(data[i + 2:i + 4], "big")
        yield marker, data[i:i + 2 + length]
        i += 2 + length


def _jpeg_keep(marker: int, seg: bytes) -> bool:
    if marker == 0xE0:
        return seg[4:9] == b"JFIF\x00"
    if marker == 0xE2:
        return seg[4:16] == b"ICC_PROFILE\x00"
    if marker == 0xEE:
        return seg[4:9] == b"Adobe"
    return not (0xE0 <= marker <= 0xEF or marker == 0xFE)


def check_jpeg(data: bytes) -> list[str]:
    names = {0xE1: "APP1 (EXIF or XMP)", 0xED: "APP13 (IPTC)", 0xFE: "COM (comment)"}
    return [f"JPEG segment {names.get(m, hex(m))} is not allowed"
            for m, seg in _jpeg_segments(data) if not _jpeg_keep(m, seg)]


def scrub_jpeg(data: bytes) -> bytes:
    return b"\xff\xd8" + b"".join(seg for m, seg in _jpeg_segments(data) if _jpeg_keep(m, seg))


# ---------------------------------------------------------------------------------------------
# SVG: only <title> and <desc> describe the file.

SVG_NS = {"http://www.w3.org/2000/svg", "http://www.w3.org/1999/xhtml", "http://www.w3.org/1999/xlink",
          "http://www.w3.org/XML/1998/namespace"}


def check_svg(data: bytes) -> list[str]:
    problems = []
    if b"<!--" in data:
        problems.append("SVG comment")
    if re.search(rb"<!DOCTYPE[^>]*\[", data):
        problems.append("SVG internal DTD subset")
    try:
        root = ET.fromstring(data)
    except ET.ParseError as exc:
        return [f"SVG not parseable ({exc})"]
    for el in root.iter():
        ns, _, local = el.tag[1:].partition("}") if el.tag.startswith("{") else ("", "", el.tag)
        if local == "metadata":
            problems.append("SVG <metadata> element")
        elif ns not in SVG_NS:
            problems.append(f"SVG element from editor namespace {ns or 'none'}: {local}")
        for attr in el.attrib:
            ans = attr[1:].partition("}")[0] if attr.startswith("{") else ""
            if ans and ans not in SVG_NS:
                problems.append(f"SVG attribute from editor namespace {ans}")
            elif attr.startswith("data-"):
                problems.append(f"SVG data attribute {attr}")
    problems += leaks(data, "SVG")
    return sorted(set(problems))


def scrub_svg(data: bytes) -> bytes:
    text = data.decode("utf-8")
    used = set(re.findall(r"\[(data-[\w-]+)", text)) | set(re.findall(r"dataset\.|getAttribute\(['\"](data-[\w-]+)", text))
    if used:
        raise ValueError(f"data attributes are used by CSS or script ({', '.join(sorted(map(str, used)))}); "
                         "removing them would change what the file shows")
    text = re.sub(r"<!--.*?-->", "", text, flags=re.S)
    text = re.sub(r"<metadata\b.*?</metadata>|<metadata\b[^>]*/>", "", text, flags=re.S)
    text = re.sub(r"""\s(?:data-[\w-]+|(?:inkscape|sodipodi|sketch|serif|figma):[\w-]+)=(?:"[^"]*"|'[^']*')""", "", text)
    text = re.sub(r"""\sxmlns:(?:inkscape|sodipodi|sketch|serif|figma|rdf|cc|dc)=(?:"[^"]*"|'[^']*')""", "", text)
    out = text.encode("utf-8")
    problems = check_svg(out)
    if problems:
        raise ValueError("scrubbed SVG still fails: " + "; ".join(problems))
    return out


# ---------------------------------------------------------------------------------------------
# Tabular and structured downloads

INTERNAL_COLUMN = re.compile(r"^(_.*|id|uuid|guid|pk|.*_id|.*_uuid|user(name)?|owner|created_by|"
                             r"path|file(name|path)?|host(name)?|ip|internal.*|debug.*)$", re.I)


def check_csv(data: bytes, columns: list[str] | None = None) -> list[str]:
    text = data.decode("utf-8-sig")
    rows = list(csv.reader(io.StringIO(text)))
    if not rows:
        return ["CSV is empty"]
    header = [h.strip() for h in rows[0]]
    problems = []
    if columns is not None:
        if header != list(columns):
            problems.append(f"CSV header {header} differs from the visible columns {list(columns)}")
    else:
        problems += [f"CSV column {h!r} looks internal" for h in header if INTERNAL_COLUMN.match(h)]
    width = len(header)
    if any(len(r) > width for r in rows[1:]):
        problems.append("CSV rows have more cells than the header (hidden columns)")
    problems += leaks(data, "CSV")
    return problems


def check_json(data: bytes, allowed_keys: set[str] | None = None) -> list[str]:
    problems = []

    def walk(node, path):
        if isinstance(node, dict):
            for key, value in node.items():
                bad = key not in allowed_keys if allowed_keys is not None else bool(INTERNAL_COLUMN.match(key))
                if bad:
                    problems.append(f"JSON key {path}{key} is not allowed")
                walk(value, f"{path}{key}.")
        elif isinstance(node, list):
            for item in node:
                walk(item, f"{path}[].")

    walk(json.loads(data.decode("utf-8-sig")), "")
    problems += leaks(data, "JSON")
    return sorted(set(problems))


OOXML_CORE_ALLOWED = {"title", "creator", "created", "language"}
OOXML_FORBIDDEN_PARTS = re.compile(r"^(docProps/custom\.xml|word/comments.*\.xml|xl/comments\d*\.xml|"
                                   r"xl/threadedComments/.*|word/people\.xml|.*/revisions/.*)$")


def check_ooxml(data: bytes, brand: str | None = None) -> list[str]:
    problems, want = [], brand_value(brand)
    with zipfile.ZipFile(io.BytesIO(data)) as z:
        names = z.namelist()
        for name in names:
            if OOXML_FORBIDDEN_PARTS.match(name):
                problems.append(f"OOXML part {name} is not allowed")
        if "docProps/core.xml" in names:
            core = ET.fromstring(z.read("docProps/core.xml"))
            for el in core:
                local = el.tag.rsplit("}", 1)[-1]
                if local not in OOXML_CORE_ALLOWED:
                    problems.append(f"OOXML core property {local} is not allowed")
                elif local == "creator" and want is not None and (el.text or "") != want:
                    problems.append(f"OOXML creator is {el.text!r}, expected the brand {want!r}")
        if "docProps/app.xml" in names:
            app = ET.fromstring(z.read("docProps/app.xml"))
            for el in app:
                local = el.tag.rsplit("}", 1)[-1]
                if local in {"Application", "AppVersion", "Company", "Manager", "Template", "TotalTime"}:
                    if not (local == "Application" and want is not None and (el.text or "") == want):
                        problems.append(f"OOXML app property {local} is not allowed")
        for name in names:
            if name.endswith(".xml") or name.endswith(".rels"):
                problems += leaks(z.read(name), f"OOXML {name}")
    return sorted(set(problems))


# ---------------------------------------------------------------------------------------------

def detect(data: bytes, path: str = "") -> str:
    head = data[:512].lstrip()
    if data.startswith(b"%PDF-"):
        return "pdf"
    if data.startswith(PNG_SIG):
        return "png"
    if data.startswith(b"\xff\xd8"):
        return "jpeg"
    if data.startswith(b"PK\x03\x04"):
        return "ooxml"
    if re.match(rb"(<\?xml[^>]*>\s*)?(<!--.*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg\b", head, re.S):
        return "svg"
    ext = os.path.splitext(path)[1].lower()
    return {".csv": "csv", ".json": "json", ".svg": "svg"}.get(ext, "unknown")


def check_bytes(data: bytes, path: str = "", brand: str | None = None,
                columns: list[str] | None = None, allowed_keys: set[str] | None = None) -> list[str]:
    kind = detect(data, path)
    if kind == "pdf":
        return check_pdf(data, brand)
    if kind == "png":
        return check_png(data)
    if kind == "jpeg":
        return check_jpeg(data)
    if kind == "svg":
        return check_svg(data)
    if kind == "csv":
        return check_csv(data, columns)
    if kind == "json":
        return check_json(data, allowed_keys)
    if kind == "ooxml":
        return check_ooxml(data, brand)
    return [f"unknown file type for {os.path.basename(path) or 'input'}"]


def check_file(path: str, brand: str | None = None, **kwargs) -> list[str]:
    with open(path, "rb") as handle:
        return check_bytes(handle.read(), path, brand, **kwargs)


def scrub_bytes(data: bytes, path: str = "", brand: str | None = None, title: str | None = None,
                lang: str | None = None, created: datetime | None = None) -> bytes:
    kind = detect(data, path)
    if kind == "pdf":
        if brand is None:
            raise ValueError("a brand is required to scrub a PDF")
        return scrub_pdf(data, brand, title=title, lang=lang, created=created)
    if kind == "png":
        return scrub_png(data)
    if kind == "jpeg":
        return scrub_jpeg(data)
    if kind == "svg":
        return scrub_svg(data)
    raise ValueError(f"no scrubber for {kind} files; fix the generator instead")


def scrub_file(path: str, brand: str | None = None, **kwargs) -> None:
    with open(path, "rb") as handle:
        data = handle.read()
    _atomic_write(path, scrub_bytes(data, path, brand, **kwargs))


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    sub = parser.add_subparsers(dest="command", required=True)
    for name in ("check", "scrub"):
        p = sub.add_parser(name)
        p.add_argument("--brand", help=f"one of {', '.join(BRANDS)} or a literal author")
        p.add_argument("files", nargs="+")
        if name == "scrub":
            p.add_argument("--title")
            p.add_argument("--lang")
    args = parser.parse_args(argv)
    failed = 0
    for path in args.files:
        try:
            if args.command == "scrub":
                scrub_file(path, args.brand, title=args.title, lang=args.lang)
            problems = check_file(path, args.brand)
        except (OSError, ValueError) as exc:
            problems = [str(exc)]
        status = "FAIL" if problems else "ok"
        print(f"{status} {path}")
        for problem in problems:
            print(f"  - {problem}")
        failed += bool(problems)
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
