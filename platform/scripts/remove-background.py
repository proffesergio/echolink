"""Local CPU cutout. rembg MIT; U2-Net weights Apache-2.0. No product upload."""
import io
import os
import sys
from PIL import Image, ImageOps
from rembg import new_session, remove
import numpy as np
from matte_cleanup import clean_apparel_islands

os.environ.setdefault('OMP_NUM_THREADS', '2')
image = ImageOps.exif_transpose(Image.open(io.BytesIO(sys.stdin.buffer.read(12_000_001)))).convert('RGBA')
if image.width * image.height > 40_000_000:
    raise ValueError('Image is too large')
model = os.environ.get('PLATFORM_REMBG_MODEL', 'u2netp')
if model not in ('u2netp', 'u2net', 'isnet-general-use'):
    raise ValueError('Unsupported cutout model')
session = new_session(model, providers=['CPUExecutionProvider'])
# Keep soft mask edges: binary post-processing erases hair, fabric fringe and
# small product details. The actual RGB product remains the original photograph.
working = image.copy()
if model in ('u2netp', 'u2net'):
    # Bound the matting solver on the shared worker PC. Keep the source RGB at
    # full resolution; only the mask and soft fringe use this working image.
    working.thumbnail((512, 512), Image.Resampling.LANCZOS)
output = remove(working, session=session, post_process_mask=False,
                alpha_matting=(model in ('u2netp', 'u2net')),
                alpha_matting_erode_size=5)
if output.size != image.size:
    alpha = output.getchannel('A').resize(image.size, Image.Resampling.LANCZOS)
    edge_rgb = output.convert('RGB').resize(image.size, Image.Resampling.LANCZOS)
    fringe = alpha.point(lambda value: 255 if 0 < value < 245 else 0)
    output = Image.composite(edge_rgb, image.convert('RGB'), fringe).convert('RGBA')
    output.putalpha(alpha)
# Apparel catalogues sometimes contain detached campaign badges/barcodes. Keep
# every large subject (including pairs/sets and models); remove only tiny mask
# islands wholly outside their combined bounds. Do not apply this to devices,
# where a small detached item may be a real accessory or component.
if os.environ.get('PLATFORM_CUTOUT_KIND') in ('apparel', 'socks'):
    output.putalpha(Image.fromarray(clean_apparel_islands(np.array(output.getchannel('A')),
                                                       paired_socks=os.environ.get('PLATFORM_CUTOUT_KIND') == 'socks')))
alpha = output.getchannel('A')
histogram = alpha.histogram()
coverage = sum(histogram[32:]) / (output.width * output.height)
if coverage < .02 or coverage > .98:
    raise ValueError('Cutout confidence is too low; retain the original product photo')
output.save(sys.stdout.buffer, format='PNG')
