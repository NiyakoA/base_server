import io
import sys
import time

# Force UTF-8 output so EasyOCR's download progress bar works on Windows
if sys.stdout.encoding != 'utf-8':
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8', errors='replace')
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding='utf-8', errors='replace')

import easyocr
import numpy as np
from flask import Flask, jsonify, request
from PIL import Image

app = Flask(__name__)

print('Loading EasyOCR model (GPU)...')
reader = easyocr.Reader(['en'], gpu=True)
print('Model ready.')


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
        img_array = np.array(image)
        result = reader.readtext(img_array)

        lines = [item[1] for item in result]
        confidences = [item[2] for item in result]

        text = '\n'.join(lines)
        confidence = int(sum(confidences) / len(confidences) * 100) if confidences else 0
        processing_time_ms = int((time.time() - start) * 1000)

        return jsonify({
            'text': text,
            'confidence': confidence,
            'processingTimeMs': processing_time_ms
        })
    except Exception as e:
        return jsonify({'error': f'Processing failed: {e}'}), 500


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, threaded=True)
