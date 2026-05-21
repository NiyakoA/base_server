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

import fitz  # PyMuPDF
import pytesseract
from google import genai
from google.genai import types as genai_types
from flask import Flask, jsonify, request
from PIL import Image, ImageFilter, ImageEnhance

pytesseract.pytesseract.tesseract_cmd = r'C:\Program Files\Tesseract-OCR\tesseract.exe'

GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY', '')
GEMINI_MODEL = os.environ.get('GEMINI_MODEL', 'models/gemini-flash-lite-latest')

HANDWRITING_PROMPT = (
    'Transcribe all text visible in this image exactly as written. '
    'Output ONLY the transcribed text with no commentary, explanation, or preamble.'
)

if GEMINI_API_KEY:
    gemini_client = genai.Client(api_key=GEMINI_API_KEY)
    print(f'Gemini ready: {GEMINI_MODEL}')
else:
    gemini_client = None
    print('WARNING: GEMINI_API_KEY not set — handwritten mode will fail')

app = Flask(__name__)


# ── Stage 1: Preprocessing ────────────────────────────────────────────────────

def preprocess(pil_image: Image.Image) -> Image.Image:
    img = pil_image.convert('L')
    img = ImageEnhance.Contrast(img).enhance(2.0)
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

def postprocess(text: str) -> str:
    cleaned = _PREAMBLE.sub('', text.strip()).strip()
    cleaned = _SUFFIX.sub('', cleaned).strip()
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

def ocr_printed(pil_image: Image.Image) -> tuple[str, int]:
    pre = preprocess(pil_image)
    text = pytesseract.image_to_string(pre, config='--psm 6').strip()
    # Parse confidence from TSV output — avoids pandas dependency
    tsv = pytesseract.image_to_data(pre, config='--psm 6', output_type=pytesseract.Output.STRING)
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


def ocr_handwritten(pil_image: Image.Image) -> tuple[str, int]:
    if not gemini_client:
        raise RuntimeError('GEMINI_API_KEY not configured — add it to .env')
    pre = preprocess(pil_image).convert('RGB')
    buf = io.BytesIO()
    pre.save(buf, format='JPEG', quality=95)
    response = gemini_client.models.generate_content(
        model=GEMINI_MODEL,
        contents=[
            genai_types.Part.from_text(text=HANDWRITING_PROMPT),
            genai_types.Part.from_bytes(data=buf.getvalue(), mime_type='image/jpeg'),
        ],
    )
    return postprocess(response.text), 95


# ── Route ─────────────────────────────────────────────────────────────────────

@app.route('/extract', methods=['POST'])
def extract():
    start = time.time()
    mode = request.form.get('mode', 'handwritten')

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
            t, c = fn(img)
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
