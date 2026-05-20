import base64
import io
import sys
import time

# Force UTF-8 output on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import requests
from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)

OLLAMA_URL = 'http://localhost:11434'
MODEL = 'llava:7b'
PROMPT = (
    'Transcribe all text visible in this image exactly as written. '
    'If the text is handwritten, preserve it faithfully including any corrections or strikethroughs. '
    'Output only the transcribed text with no commentary, labels, or explanation.'
)

print(f'OCR service ready — using {MODEL} via Ollama on {OLLAMA_URL}')


@app.route('/extract', methods=['POST'])
def extract():
    start = time.time()

    file = request.files.get('image')
    if not file:
        return jsonify({'error': 'No image provided'}), 422

    try:
        image = Image.open(io.BytesIO(file.read())).convert('RGB')
    except Exception as e:
        return jsonify({'error': f'Invalid image: {e}'}), 422

    try:
        buf = io.BytesIO()
        image.save(buf, format='JPEG', quality=95)
        img_b64 = base64.b64encode(buf.getvalue()).decode('utf-8')

        response = requests.post(
            f'{OLLAMA_URL}/api/generate',
            json={
                'model': MODEL,
                'prompt': PROMPT,
                'images': [img_b64],
                'stream': False
            },
            timeout=120
        )

        if not response.ok:
            return jsonify({'error': f'Ollama error: {response.status_code}'}), 500

        text = response.json().get('response', '').strip()
        processing_time_ms = int((time.time() - start) * 1000)

        return jsonify({
            'text': text,
            'confidence': 95,
            'processingTimeMs': processing_time_ms
        })

    except requests.exceptions.ConnectionError:
        return jsonify({'error': 'Ollama is not running — start it with: ollama serve'}), 503
    except Exception as e:
        return jsonify({'error': f'Processing failed: {e}'}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, threaded=True)
