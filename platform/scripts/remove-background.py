"""Local CPU cutout. rembg MIT; U2-Net weights Apache-2.0. No product upload."""
import io
import os
import sys
from PIL import Image
from rembg import new_session, remove

os.environ.setdefault('OMP_NUM_THREADS', '2')
image = Image.open(io.BytesIO(sys.stdin.buffer.read(12_000_001))).convert('RGBA')
if image.width * image.height > 40_000_000:
    raise ValueError('Image is too large')
session = new_session('u2netp', providers=['CPUExecutionProvider'])
output = remove(image, session=session, post_process_mask=True)
alpha = output.getchannel('A')
histogram = alpha.histogram()
coverage = sum(histogram[32:]) / (output.width * output.height)
if coverage < .02 or coverage > .98:
    raise ValueError('Cutout confidence is too low; retain the original product photo')
output.save(sys.stdout.buffer, format='PNG')
