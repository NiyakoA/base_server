import io
import math
import time

import torch
import torch.nn.functional as F
from flask import Flask, jsonify, request
from PIL import Image
from transformers import TrOCRProcessor, VisionEncoderDecoderModel

app = Flask(__name__)

DEVICE = 'cuda' if torch.cuda.is_available() else 'cpu'
print(f'Loading TrOCR model on {DEVICE}...')

processor = TrOCRProcessor.from_pretrained('microsoft/trocr-large-handwritten')
model = VisionEncoderDecoderModel.from_pretrained('microsoft/trocr-large-handwritten').to(DEVICE)
model.eval()

print('Model ready.')


def compute_confidence(scores) -> int:
    if not scores:
        return 0
    probs = [F.softmax(s, dim=-1).max(dim=-1).values.item() for s in scores]
    return int(math.exp(sum(math.log(max(p, 1e-9)) for p in probs) / len(probs)) * 100)


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

    pixel_values = processor(images=image, return_tensors='pt').pixel_values.to(DEVICE)

    with torch.no_grad():
        outputs = model.generate(
            pixel_values,
            return_dict_in_generate=True,
            output_scores=True,
            max_new_tokens=128
        )

    text = processor.batch_decode(outputs.sequences, skip_special_tokens=True)[0]
    confidence = compute_confidence(outputs.scores)
    processing_time_ms = int((time.time() - start) * 1000)

    return jsonify({
        'text': text,
        'confidence': confidence,
        'processingTimeMs': processing_time_ms
    })


if __name__ == '__main__':
    app.run(host='127.0.0.1', port=5001, threaded=True)
