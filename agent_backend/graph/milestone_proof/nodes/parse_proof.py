"""
Node 2 — parse_proof

Turns whatever the creator uploaded into text the consistency check can reason
over, plus a confidence in how much we could actually read.

Four accepted proof types:

  image → vision LLM OCRs receipts and progress photos
  pdf   → text layer extracted directly (invoices, contracts)
  link  → GitHub commit/repo via the API, or the page's own text
  text  → the creator's explanation, which is all there is to read

A short text description is always allowed alongside any of the above, so it is
appended to the parsed content regardless of type.

ocr_confidence answers "how legible was this?", not "is it true?" — a crisp,
perfectly readable receipt for the wrong thing still scores 1.0 here and gets
caught by consistency_check.
"""
from __future__ import annotations

import base64
import logging
import re
from typing import Optional
from urllib.parse import urlparse

import httpx
from langchain_core.messages import HumanMessage, SystemMessage

from db.config import settings
from models.milestone_schemas import MilestoneProofState, ProofType

from ..llm_utils import build_llm, clamp01, extract_json

logger = logging.getLogger(__name__)

# ─── Amount extraction ────────────────────────────────────────────────────────
# Only ETH-denominated amounts are comparable to on-chain outflow. Fiat amounts
# on a receipt would need a price feed at the transaction date to convert, which
# this flow deliberately does not guess at — it flags them instead.
_ETH_AMOUNT_RE = re.compile(
    r"(\d+(?:[.,]\d+)?)\s*(?:ETH\b|Ξ|ether\b)", re.IGNORECASE
)
_FIAT_AMOUNT_RE = re.compile(
    r"(?:[$€£₦]\s*\d+(?:[.,]\d+)?)|(?:\d+(?:[.,]\d+)?\s*(?:USD|EUR|GBP|NGN)\b)",
    re.IGNORECASE,
)

VISION_SYSTEM_PROMPT = """You are a document-extraction engine for a crowdfunding platform's milestone verification system.

You will be shown an image submitted as proof that a project milestone was completed — typically a receipt, an invoice, a payment record, or a photo of physical progress (construction, hardware, an event).

Extract what is actually visible. Do not infer, complete, or invent details that are not legible in the image.

Respond ONLY with a valid JSON object in this exact format (no markdown, no explanation):
{
  "extracted_text": "<all text visible in the image, verbatim; empty string if none>",
  "document_type": "<receipt | invoice | payment_record | photo_of_work | screenshot | other>",
  "visual_description": "<1-2 sentences describing what the image shows, for non-text images>",
  "amounts": [{"value": <number>, "currency": "<ETH|USD|EUR|GBP|other>"}],
  "dates": ["<any dates visible, as written>"],
  "entities": ["<company names, people, or line items visible>"],
  "legibility_confidence": <float 0.0 to 1.0 — how clearly you could read this image>
}"""


# ─── Download helper ──────────────────────────────────────────────────────────

async def _download(url: str) -> tuple[Optional[bytes], Optional[str]]:
    """
    Fetch a proof file, refusing anything over PROOF_MAX_DOWNLOAD_BYTES.
    Returns (content, content_type) or (None, None) on any failure.
    """
    try:
        async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
            resp = await client.get(url)
            resp.raise_for_status()

            declared = int(resp.headers.get("content-length") or 0)
            if declared > settings.PROOF_MAX_DOWNLOAD_BYTES:
                logger.warning(f"[parse_proof] Refusing {declared} byte download: {url}")
                return None, None

            content = resp.content
            if len(content) > settings.PROOF_MAX_DOWNLOAD_BYTES:
                logger.warning(f"[parse_proof] Body exceeded cap after read: {url}")
                return None, None

            return content, (resp.headers.get("content-type") or "").split(";")[0].strip()
    except Exception as exc:
        logger.warning(f"[parse_proof] Download failed for {url}: {exc}")
        return None, None


def _find_amounts(text: str) -> tuple[list[float], bool]:
    """Return (ETH amounts found, whether any fiat amount was seen)."""
    eth: list[float] = []
    for raw in _ETH_AMOUNT_RE.findall(text or ""):
        try:
            eth.append(float(raw.replace(",", ".")))
        except ValueError:
            continue
    return eth, bool(_FIAT_AMOUNT_RE.search(text or ""))


# ─── Per-type parsers ─────────────────────────────────────────────────────────

async def _parse_image(url: str) -> dict:
    """OCR an image proof with the vision model."""
    content, content_type = await _download(url)
    if content is None:
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["proof_image_unreachable"],
        }

    if content_type and not content_type.startswith("image/"):
        logger.warning(f"[parse_proof] Expected image, server sent {content_type}")

    mime = content_type if (content_type or "").startswith("image/") else "image/jpeg"
    b64  = base64.b64encode(content).decode("ascii")

    try:
        llm = build_llm(vision=True, max_tokens=1200)
        response = await llm.ainvoke([
            SystemMessage(content=VISION_SYSTEM_PROMPT),
            HumanMessage(content=[
                {"type": "text", "text": "Extract everything visible in this milestone proof image."},
                {"type": "image_url", "image_url": {"url": f"data:{mime};base64,{b64}"}},
            ]),
        ])
        parsed = extract_json(response.content, expect_key="extracted_text")
    except Exception as exc:
        logger.error(f"[parse_proof] Vision model failed: {exc}", exc_info=True)
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            # Not the creator's fault — confidence_scorer routes this to a human
            # rather than letting an outage read as a failed proof.
            "proof_flags": ["vision_model_unavailable"],
        }

    extracted  = (parsed.get("extracted_text") or "").strip()
    visual     = (parsed.get("visual_description") or "").strip()
    doc_type   = parsed.get("document_type") or "other"
    dates      = parsed.get("dates") or []
    entities   = parsed.get("entities") or []
    confidence = clamp01(parsed.get("legibility_confidence"), 0.5)

    # Amounts the model reported, plus anything the regex catches in the text
    eth_amounts: list[float] = []
    saw_fiat = False
    for item in parsed.get("amounts") or []:
        if not isinstance(item, dict):
            continue
        currency = str(item.get("currency") or "").upper()
        try:
            value = float(item.get("value"))
        except (TypeError, ValueError):
            continue
        if currency == "ETH":
            eth_amounts.append(value)
        else:
            saw_fiat = True

    regex_eth, regex_fiat = _find_amounts(extracted)
    eth_amounts.extend(a for a in regex_eth if a not in eth_amounts)
    saw_fiat = saw_fiat or regex_fiat

    flags: list[str] = [f"document_type_{doc_type}"]
    if not extracted and not visual:
        flags.append("proof_image_illegible")
        confidence = min(confidence, 0.15)
    elif not extracted:
        # A photo of physical work with no text is legitimate for some
        # milestones — it just cannot corroborate a spend amount.
        flags.append("proof_image_no_text")
    if saw_fiat:
        flags.append("proof_amounts_in_fiat_not_convertible")

    body = "\n".join(filter(None, [
        f"Document type: {doc_type}",
        f"Visible text:\n{extracted}" if extracted else "",
        f"Image shows: {visual}" if visual else "",
        f"Dates on document: {', '.join(map(str, dates))}" if dates else "",
        f"Named entities/line items: {', '.join(map(str, entities))}" if entities else "",
    ]))

    return {
        "parsed_content":     body,
        "parsed_amounts_eth": eth_amounts,
        "ocr_confidence":     confidence,
        "proof_flags":        flags,
    }


async def _parse_pdf(url: str) -> dict:
    """Extract the text layer from a PDF proof."""
    content, _ = await _download(url)
    if content is None:
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["proof_pdf_unreachable"],
        }

    try:
        from pypdf import PdfReader
    except ImportError:
        logger.error("[parse_proof] pypdf not installed — cannot read PDF proofs")
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["pdf_reader_unavailable"],
        }

    import io

    try:
        reader = PdfReader(io.BytesIO(content))
        pages  = [(page.extract_text() or "") for page in reader.pages[:20]]
        text   = "\n".join(pages).strip()
        page_count = len(reader.pages)
    except Exception as exc:
        logger.error(f"[parse_proof] PDF parse failed: {exc}", exc_info=True)
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["proof_pdf_corrupt"],
        }

    flags: list[str] = []
    if not text:
        # Scanned PDFs have no text layer. Rendering pages to images needs a
        # native dependency (poppler) this service does not ship, so the proof
        # goes to a human instead of being scored as unreadable.
        flags.append("proof_pdf_no_text_layer")
        confidence = 0.2
    elif len(text) < 40:
        flags.append("proof_pdf_near_empty")
        confidence = 0.4
    else:
        # A digital text layer is a far more reliable read than OCR.
        confidence = 0.92

    eth_amounts, saw_fiat = _find_amounts(text)
    if saw_fiat:
        flags.append("proof_amounts_in_fiat_not_convertible")

    return {
        "parsed_content":     f"PDF ({page_count} page(s)) text:\n{text[:8000]}" if text else "",
        "parsed_amounts_eth": eth_amounts,
        "ocr_confidence":     confidence,
        "proof_flags":        flags,
    }


async def _parse_github(parts: list[str]) -> Optional[dict]:
    """
    Read a GitHub repo, commit, or PR link through the API.
    Returns None if the URL does not look like something the API can resolve.
    """
    if len(parts) < 2:
        return None
    owner, repo = parts[0], parts[1]

    async def api(path: str) -> Optional[dict | list]:
        try:
            async with httpx.AsyncClient(timeout=20.0, follow_redirects=True) as client:
                resp = await client.get(
                    f"https://api.github.com/repos/{owner}/{repo}{path}",
                    headers={"Accept": "application/vnd.github+json"},
                )
                if resp.status_code != 200:
                    logger.warning(f"[parse_proof] GitHub API {resp.status_code} for {path}")
                    return None
                return resp.json()
        except Exception as exc:
            logger.warning(f"[parse_proof] GitHub API call failed: {exc}")
            return None

    # /commit/<sha> or /commits/<sha>
    if len(parts) >= 4 and parts[2] in ("commit", "commits"):
        data = await api(f"/commits/{parts[3]}")
        if not data or not isinstance(data, dict):
            return None
        commit = data.get("commit", {})
        stats  = data.get("stats", {})
        files  = [f.get("filename", "") for f in (data.get("files") or [])][:25]
        body = "\n".join([
            f"GitHub commit in {owner}/{repo}",
            f"SHA: {data.get('sha', '')[:12]}",
            f"Author: {(commit.get('author') or {}).get('name', 'unknown')}",
            f"Date: {(commit.get('author') or {}).get('date', 'unknown')}",
            f"Message: {commit.get('message', '')}",
            f"Changes: +{stats.get('additions', 0)} −{stats.get('deletions', 0)} "
            f"across {len(data.get('files') or [])} file(s)",
            f"Files: {', '.join(files)}" if files else "",
        ])
        return {
            "parsed_content": body,
            "ocr_confidence": 0.95,   # Verified against the GitHub API itself
            "proof_flags": ["proof_github_commit_verified"],
        }

    # /pull/<n>
    if len(parts) >= 4 and parts[2] == "pull":
        data = await api(f"/pulls/{parts[3]}")
        if not data or not isinstance(data, dict):
            return None
        body = "\n".join([
            f"GitHub pull request #{data.get('number')} in {owner}/{repo}",
            f"Title: {data.get('title', '')}",
            f"State: {data.get('state')} (merged: {data.get('merged', False)})",
            f"Author: {(data.get('user') or {}).get('login', 'unknown')}",
            f"Created: {data.get('created_at')} / Merged: {data.get('merged_at')}",
            f"Changes: +{data.get('additions', 0)} −{data.get('deletions', 0)} "
            f"across {data.get('changed_files', 0)} file(s)",
            f"Description: {(data.get('body') or '')[:1500]}",
        ])
        return {
            "parsed_content": body,
            "ocr_confidence": 0.95,
            "proof_flags": ["proof_github_pr_verified"],
        }

    # Bare repo link → summarise the repo and its recent commits
    repo_data = await api("")
    if not repo_data or not isinstance(repo_data, dict):
        return None
    commits = await api("/commits?per_page=10")
    commit_lines = []
    if isinstance(commits, list):
        for c in commits:
            msg  = ((c.get("commit") or {}).get("message") or "").splitlines()[:1]
            date = ((c.get("commit") or {}).get("author") or {}).get("date", "")
            commit_lines.append(f"  - {date}: {msg[0] if msg else ''}")

    body = "\n".join([
        f"GitHub repository {owner}/{repo}",
        f"Description: {repo_data.get('description') or '(none)'}",
        f"Language: {repo_data.get('language')} | Stars: {repo_data.get('stargazers_count')}",
        f"Created: {repo_data.get('created_at')} | Last push: {repo_data.get('pushed_at')}",
        "Recent commits:" if commit_lines else "",
        *commit_lines,
    ])
    return {
        "parsed_content": body,
        "ocr_confidence": 0.9,
        "proof_flags": ["proof_github_repo_verified"],
    }


async def _parse_link(url: str) -> dict:
    """
    Read a link proof. GitHub goes through the API; anything else falls back to
    the page's own text. Video and Drive links are marked unverifiable — their
    real content sits behind JavaScript we cannot see from here.
    """
    try:
        parsed_url = urlparse(url if "://" in url else f"https://{url}")
    except Exception:
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["proof_link_malformed"],
        }

    host  = (parsed_url.netloc or "").lower().removeprefix("www.")
    parts = [p for p in (parsed_url.path or "").split("/") if p]

    if host in ("github.com", "gist.github.com"):
        result = await _parse_github(parts)
        if result is not None:
            return result
        logger.info(f"[parse_proof] GitHub API could not resolve {url} — falling back to page text")

    # Media/drive hosts render their content client-side; fetching the HTML gets
    # us the title and little else, so the claim itself stays unverified.
    media_hosts = (
        "youtube.com", "youtu.be", "vimeo.com",
        "drive.google.com", "docs.google.com", "loom.com",
    )
    is_media = any(host == h or host.endswith(f".{h}") for h in media_hosts)

    content, content_type = await _download(url)
    if content is None:
        return {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags": ["proof_link_unreachable"],
        }

    html = content.decode("utf-8", errors="replace")

    title_match = re.search(r"<title[^>]*>(.*?)</title>", html, re.IGNORECASE | re.DOTALL)
    title = re.sub(r"\s+", " ", title_match.group(1)).strip() if title_match else ""

    desc_match = re.search(
        r'<meta[^>]+(?:name|property)=["\'](?:description|og:description)["\'][^>]+'
        r'content=["\'](.*?)["\']',
        html, re.IGNORECASE | re.DOTALL,
    )
    description = re.sub(r"\s+", " ", desc_match.group(1)).strip() if desc_match else ""

    # Strip scripts/styles, then tags, to get at the visible copy
    body_text = re.sub(r"<(script|style)\b[^>]*>.*?</\1>", " ", html, flags=re.IGNORECASE | re.DOTALL)
    body_text = re.sub(r"<[^>]+>", " ", body_text)
    body_text = re.sub(r"\s+", " ", body_text).strip()[:4000]

    flags: list[str] = []
    if is_media:
        flags.append("proof_link_content_unverifiable")
        confidence = 0.35
    elif content_type and "html" not in content_type and "text" not in content_type:
        flags.append(f"proof_link_non_html_{content_type.replace('/', '_')}")
        confidence = 0.5
    elif not body_text:
        flags.append("proof_link_no_readable_content")
        confidence = 0.3
    else:
        # A live page we could read, but nothing authenticates it as the
        # creator's own work — mid confidence by design.
        confidence = 0.65

    eth_amounts, saw_fiat = _find_amounts(f"{title} {description} {body_text}")
    if saw_fiat:
        flags.append("proof_amounts_in_fiat_not_convertible")

    body = "\n".join(filter(None, [
        f"Link: {url}",
        f"Page title: {title}" if title else "",
        f"Meta description: {description}" if description else "",
        f"Page text (truncated):\n{body_text}" if body_text else "",
    ]))

    return {
        "parsed_content":     body,
        "parsed_amounts_eth": eth_amounts,
        "ocr_confidence":     confidence,
        "proof_flags":        flags,
    }


# ─── Node ─────────────────────────────────────────────────────────────────────

async def parse_proof(state: MilestoneProofState) -> dict:
    """LangGraph node: extract readable content from the submitted proof."""
    if state.error:
        return {}

    logger.info(f"[parse_proof] proof={state.proof_id} type={state.proof_type.value}")

    proof_type = state.proof_type
    url        = (state.proof_url or "").strip()

    if proof_type == ProofType.TEXT:
        result = {
            "parsed_content":  "",
            "ocr_confidence":  0.5,   # nothing to read but the creator's own words
            "proof_flags":     ["proof_text_only"],
        }
    elif not url:
        logger.warning(f"[parse_proof] proof_type={proof_type.value} submitted without a URL")
        result = {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags":    ["proof_url_missing"],
        }
    elif proof_type == ProofType.IMAGE:
        result = await _parse_image(url)
    elif proof_type == ProofType.PDF:
        result = await _parse_pdf(url)
    elif proof_type == ProofType.LINK:
        result = await _parse_link(url)
    else:
        result = {
            "parsed_content": "",
            "ocr_confidence": 0.0,
            "proof_flags":    [f"unsupported_proof_type_{proof_type.value}"],
        }

    # The creator's own description rides along with every proof type
    creator_note = (state.proof_text or "").strip()
    if creator_note:
        parsed = result.get("parsed_content") or ""
        result["parsed_content"] = (
            f"{parsed}\n\nCreator's description:\n{creator_note[:2000]}"
            if parsed else f"Creator's description:\n{creator_note[:2000]}"
        )
        note_eth, _ = _find_amounts(creator_note)
        if note_eth:
            existing = list(result.get("parsed_amounts_eth") or [])
            existing.extend(a for a in note_eth if a not in existing)
            result["parsed_amounts_eth"] = existing

    logger.info(
        f"[parse_proof] proof={state.proof_id} ocr_confidence="
        f"{result.get('ocr_confidence', 0):.2f} chars={len(result.get('parsed_content') or '')} "
        f"eth_amounts={result.get('parsed_amounts_eth') or []} flags={result.get('proof_flags')}"
    )
    return result
