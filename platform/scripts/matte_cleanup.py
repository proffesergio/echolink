"""Conservative apparel-mask cleanup using rembg's existing dependencies."""
import numpy as np
from scipy.ndimage import label, find_objects


def clean_apparel_islands(matte, paired_socks=False):
    labels, count = label(matte > 16, structure=np.ones((3, 3), dtype=np.uint8))
    if not count:
        return matte
    areas = np.bincount(labels.ravel())
    largest = int(areas[1:].max())
    regions = find_objects(labels)
    substantial = [i for i in range(1, count + 1) if areas[i] >= largest * (.06 if paired_socks else .04)]
    left = min(regions[i-1][1].start for i in substantial)
    top = min(regions[i-1][0].start for i in substantial)
    right = max(regions[i-1][1].stop for i in substantial)
    bottom = max(regions[i-1][0].stop for i in substantial)
    result = matte.copy()
    for i, region in enumerate(regions, 1):
        if i in substantial or region is None:
            continue
        ys, xs = region
        if paired_socks or xs.stop < left or xs.start > right or ys.stop < top or ys.start > bottom:
            result[max(0, ys.start-2):min(matte.shape[0], ys.stop+2),
                   max(0, xs.start-2):min(matte.shape[1], xs.stop+2)] = 0
    return result
