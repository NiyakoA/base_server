import io
import os
import re
import sys
import time

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

import numpy as np
import fitz  # PyMuPDF
import pytesseract
from google import genai
from google.genai import types as genai_types
from flask import Flask, jsonify, request
from PIL import Image, ImageFilter, ImageEnhance

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'models/gemini-flash-lite-latest')

ANSWER_CHECK_PROMPT = (
    'Look at this student exam paper image.\n'
    'I need a single YES or NO answer to this question:\n'
    'Did the student physically write or mark ANYTHING by hand on this paper?\n\n'
    'Count as YES:\n'
    '- Any letter, word, or number written in pen or pencil\n'
    '- Any circled, bubbled, checked, or crossed answer choice\n'
    '- Any mark, scribble, or erasure made by hand\n\n'
    'Count as NO:\n'
    '- Only pre-printed question text with no student marks whatsoever\n\n'
    'Reply with ONLY the single word YES or NO. Nothing else.'
)

HANDWRITING_PROMPT = (
    'You are scanning a student exam paper to extract their answers. '
    'Your job is to find and return ONLY what the student filled in or wrote — nothing else.\n\n'
    'Look for TWO types of student answers:\n'
    '1. SELECTED CHOICES — letters or options the student circled, filled, bubbled, checked, or crossed (e.g. "A", "B", "True", "Yes")\n'
    '2. WRITTEN RESPONSES — words, sentences, or numbers the student handwrote in answer spaces\n\n'
    'Rules:\n'
    '- Ignore ALL pre-printed text: question text, instructions, labels, answer choices that are NOT selected\n'
    '- If a question has nothing circled and nothing written, output nothing for it\n'
    '- Preserve question numbers where visible (e.g. "1. A", "2. photosynthesis")\n'
    '- Output ONLY the extracted answers with no commentary or explanation'
)

if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    print(f'Gemini ready: {GEMINI_MODEL}')
else:
    gemini_client = None
    print('WARNING: GEMINI_API_KEY not set — handwritten mode will fail')

app = Flask(__name__)


# ── Blank page detection ──────────────────────────────────────────────────────

# A blank page has almost no dark pixels — just sensor noise (~0.05%).
# A page with any ink/handwriting will have well above 0.5% dark pixels.
BLANK_DARK_PIXEL_RATIO = 0.005  # 0.5%
BLANK_PIXEL_THRESHOLD = 140     # pixel value < this is considered "dark"

def is_blank(pil_image: Image.Image) -> bool:
    gray = np.array(pil_image.convert('L'))
    dark_ratio = (gray < BLANK_PIXEL_THRESHOLD).sum() / gray.size
    return dark_ratio < BLANK_DARK_PIXEL_RATIO


# ── Stage 1: Preprocessing ────────────────────────────────────────────────────

def preprocess(pil_image: Image.Image) -> Image.Image:
    img = pil_image.convert('L')
    # Pad all sides so edge content is never clipped by Tesseract or vision models.
    # Bottom gets extra padding because exam answers often run to the last line.
    pad_h = max(40, img.height // 15)
    pad_w = max(40, img.width // 15)
    padded = Image.new('L', (img.width + pad_w * 2, img.height + pad_h * 2 + pad_h), 255)
    padded.paste(img, (pad_w, pad_h))
    img = ImageEnhance.Contrast(padded).enhance(2.0)
    img = img.filter(ImageFilter.SHARPEN)
    return img


# ── Stage 3: Post-processing ──────────────────────────────────────────────────

_PREAMBLE = re.compile(
    r'^(the\s+text\s+(in\s+the\s+(image|photo)\s+)?(reads|says|is|states)\s*[:\-]?\s*'
    r'|here\s+is\s+the\s+(transcribed\s+)?text\s*[:\-]?\s*'
    r'|transcription\s*[:\-]?\s*)',
    re.IGNORECASE,
)
_SUFFIX = re.compile(
    r'\n\n(there\s+is\s+no\s+other\s+(visible\s+)?text.*|note\s*:.*)$',
    re.IGNORECASE,
)
# Catch Gemini describing a blank image instead of returning empty.
_BLANK_RESPONSE = re.compile(
    r'^(the\s+image\s+(appears?\s+)?blank'
    r'|no\s+(handwritten\s+)?(text|writing)\s+(is\s+)?(visible|present|found)'
    r'|there\s+is\s+no\s+(handwritten\s+)?text'
    r'|i\s+(do\s+not|don\'t|can\'t|cannot)\s+see\s+any\s+(handwritten\s+)?text'
    r'|blank\s+(page|image|sheet)'
    r'|the\s+page\s+is\s+blank'
    r'|empty\s+(string|page|image))\s*\.?$',
    re.IGNORECASE,
)

def postprocess(text: str) -> str:
    cleaned = _PREAMBLE.sub('', text.strip()).strip()
    cleaned = _SUFFIX.sub('', cleaned).strip()
    if _BLANK_RESPONSE.match(cleaned):
        return ''
    return cleaned


# ── Helpers ───────────────────────────────────────────────────────────────────

def pdf_to_images(pdf_bytes: bytes) -> list:
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    images = []
    for page in doc:
        pix = page.get_pixmap(matrix=fitz.Matrix(2.0, 2.0))
        images.append(Image.frombytes('RGB', [pix.width, pix.height], pix.samples))
    doc.close()
    return images


# ── Stage 2: Recognition ──────────────────────────────────────────────────────

def ocr_printed(pil_image: Image.Image, student_paper: bool = False) -> tuple[str, int]:
    if is_blank(pil_image):
        return '', 0

    # Tesseract reads ALL text including pre-printed questions.
    # Only gate on student marks for the student paper — answer keys are
    # fully printed and would fail this check.
    if student_paper and gemini_client:
        img_bytes = _prepare_image_bytes(pil_image)
        if not _student_wrote_anything(img_bytes):
            return '', 0

    pre = preprocess(pil_image)
    # PSM 3 (auto) is more robust than PSM 4 for exam pages with varying layouts.
    text = pytesseract.image_to_string(pre, config='--psm 3').strip()
    # Parse confidence from TSV output — avoids pandas dependency
    tsv = pytesseract.image_to_data(pre, config='--psm 3', output_type=pytesseract.Output.STRING)
    confs = []
    for line in tsv.splitlines()[1:]:  # skip header
        parts = line.split('\t')
        if len(parts) >= 11:
            try:
                c = int(parts[10])
                if c >= 0:
                    confs.append(c)
            except ValueError:
                pass
    confidence = int(sum(confs) / len(confs)) if confs else 90
    return text, confidence


# Gemini vision handles images best up to this dimension on each side.
# Larger images are silently downsampled, which can cause the bottom of a
# tall exam page to become blurry and unreadable.
GEMINI_MAX_DIM = 2048

def _prepare_image_bytes(pil_image: Image.Image) -> bytes:
    """Preprocess and resize to Gemini's optimal window, return JPEG bytes."""
    pre = preprocess(pil_image).convert('RGB')
    if pre.width > GEMINI_MAX_DIM or pre.height > GEMINI_MAX_DIM:
        pre.thumbnail((GEMINI_MAX_DIM, GEMINI_MAX_DIM), Image.LANCZOS)
    buf = io.BytesIO()
    pre.save(buf, format='JPEG', quality=95)
    return buf.getvalue()


def _student_wrote_anything(img_bytes: bytes) -> bool:
    """Two-pass blank check: ask Gemini a simple YES/NO before full extraction."""
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai_types.Part.from_text(text=ANSWER_CHECK_PROMPT),
            genai_types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
        ],
    )
    return response.text.strip().upper().startswith('YES')


def ocr_handwritten(pil_image: Image.Image, student_paper: bool = False) -> tuple[str, int]:
    if not gemini_client:
        raise RuntimeError('GEMINI_API_KEY not configured — add it to .env')

    if is_blank(pil_image):
        return '', 0

    img_bytes = _prepare_image_bytes(pil_image)

    # Gate: only check for student marks on the student paper, not the answer key.
    if student_paper and not _student_wrote_anything(img_bytes):
        return '', 0

    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai_types.Part.from_text(text=HANDWRITING_PROMPT),
            genai_types.Part.from_bytes(data=img_bytes, mime_type='image/jpeg'),
        ],
    )
    return postprocess(response.text), 95


# ── Route ─────────────────────────────────────────────────────────────────────

@app.route('/extract', methods=['POST'])
def extract():
    start = time.time()
    mode = request.form.get('mode', 'handwritten')
    student_paper = request.form.get('documentType', '') == 'student_paper'

    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image provided'}), 422

    raw = file.read()
    is_pdf = (file.mimetype == 'application/pdf') or raw[:4] == b'%PDF'

    try:
        images = pdf_to_images(raw) if is_pdf else [Image.open(io.BytesIO(raw)).convert('RGB')]
    except Exception as e:
        return jsonify({'error': f'Could not read file: {e}'}), 422

    try:
        texts, confs = [], []
        fn = ocr_printed if mode == 'printed' else ocr_handwritten
        for img in images:
            t, c = fn(img, student_paper=student_paper)
            if t:
                texts.append(t)
                confs.append(c)

        pipeline = 'tesseract' if mode == 'printed' else GEMINI_MODEL
        return jsonify({
            'text': '\n\n'.join(texts),
            'confidence': int(sum(confs) / len(confs)) if confs else 0,
            'processingTimeMs': int((time.time() - start) * 1000),
            'pipeline': pipeline,
        })

    except RuntimeError as e:
        return jsonify({'error': str(e)}), 503
    except Exception as e:
        return jsonify({'error': f'Processing failed: {e}'}), 500


if __name__ == '__main__':
    print('Checking Tesseract...')
    pytesseract.get_tesseract_version()
    print('Tesseract ready.')
    print('Service ready on :5001')
    app.run(host='127.0.0.1', port=5001, threaded=True)
