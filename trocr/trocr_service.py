import base64
import io
import sys
import time

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import fitz  # PyMuPDF
import easyocr
import numpy as np
import requests
from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)

OLLAMA_URL = 'http://localhost:11434'
LLAVA_MODEL = 'llava:7b'
HANDWRITING_PROMPT = (
    'Transcribe all text visible in this image exactly as written. '
    'Preserve handwriting faithfully including corrections or strikethroughs. '
    'Output only the transcribed text with no commentary or explanation.'
)

print('Loading EasyOCR (printed text engine)...')
easy_reader = easyocr.Reader(['en'], gpu=True)
print(f'EasyOCR ready. Handwriting engine: {LLAVA_MODEL} via Ollama.')
print('Service ready on :5001')


def pdf_to_images(pdf_bytes: bytes) -> list:
    doc = fitz.open(stream=pdf_bytes, filetype='pdf')
    images = []
    for page in doc:
        mat = fitz.Matrix(2.0, 2.0)  # ~144 DPI — enough for OCR, not too heavy
        pix = page.get_pixmap(matrix=mat)
        images.append(Image.frombytes('RGB', [pix.width, pix.height], pix.samples))
    doc.close()
    return images


def ocr_printed(pil_image: Image.Image) -> tuple[str, int]:
    result = easy_reader.readtext(np.array(pil_image))
    lines = [item[1] for item in result]
    confs = [item[2] for item in result]
    text = '\n'.join(lines)
    confidence = int(sum(confs) / len(confs) * 100) if confs else 0
    return text, confidence


def ocr_handwritten(pil_image: Image.Image) -> tuple[str, int]:
    buf = io.BytesIO()
    pil_image.save(buf, format='JPEG', quality=95)
    img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

    resp = requests.post(
        f'{OLLAMA_URL}/api/generate',
        json={'model': LLAVA_MODEL, 'prompt': HANDWRITING_PROMPT, 'images': [img_b64], 'stream': False},
        timeout=120
    )
    resp.raise_for_status()
    return resp.json().get('response', '').strip(), 95


@app.route('/extract', methods=['POST'])
def extract():
    start = time.time()
    mode = request.form.get('mode', 'handwritten')  # 'handwritten' | 'printed'

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

        pipeline = 'easyocr' if mode == 'printed' else LLAVA_MODEL
        return jsonify({
            'text': '\n\n'.join(texts),
            'confidence': int(sum(confs) / len(confs)) if confs else 0,
            'processingTimeMs': int((time.time() - start) * 1000),
            'pipeline': pipeline
        })

    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Ollama is not running — start it with: ollama serve'}), 503
    except Exception as e:
        return jsonify({'error': f'Processing failed: {e}'}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, threaded=True)
