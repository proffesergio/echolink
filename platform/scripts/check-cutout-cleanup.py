import numpy as np
from matte_cleanup import clean_apparel_islands

matte = np.zeros((300, 300), dtype=np.uint8)
matte[90:260, 40:110] = 255
matte[90:260, 180:250] = 255
matte[30:40, 140:150] = 255  # Detached campaign badge.
matte[150:155, 140:145] = 255  # Detail inside the shared subject bounds.
cleaned = clean_apparel_islands(matte)
assert not cleaned[30:40, 140:150].any()
assert np.array_equal(cleaned[90:260, 40:110], matte[90:260, 40:110])
assert np.array_equal(cleaned[90:260, 180:250], matte[90:260, 180:250])
assert cleaned[150:155, 140:145].all()
paired = clean_apparel_islands(matte, paired_socks=True)
assert not paired[150:155, 140:145].any()
assert np.array_equal(paired[90:260, 40:110], matte[90:260, 40:110])
assert np.array_equal(paired[90:260, 180:250], matte[90:260, 180:250])
assert not clean_apparel_islands(np.zeros((20, 20), dtype=np.uint8)).any()
print('Apparel mask checks passed: detached badge removed; pairs and internal details retained.')
