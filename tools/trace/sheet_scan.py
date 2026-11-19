"""Align a photograph of the personal handwriting sheet using its four black squares."""
from itertools import product

import numpy as np
from PIL import Image, ImageOps
from scipy import ndimage
from skimage.filters import threshold_otsu

from personal_sheet import HEIGHT, MARK_SIZE, WIDTH


def _candidates(image):
    """Find compact, filled components near each corner of the upright page."""
    gray = np.asarray(image)
    ink = gray <= threshold_otsu(gray)
    labels, _ = ndimage.label(ink)
    groups = [[], [], [], []]  # top-left, top-right, bottom-left, bottom-right
    w, h = image.size
    for label, box in enumerate(ndimage.find_objects(labels), 1):
        ys, xs = box
        dx, dy = xs.stop - xs.start, ys.stop - ys.start
        if min(dx, dy) < max(4, min(w, h) * .004) or max(dx, dy) > max(w, h) * .045:
            continue
        area = np.count_nonzero(labels[box] == label)
        if area < .62 * dx * dy or not .5 <= dx / dy <= 2:
            continue
        x, y = (xs.start + xs.stop) / 2, (ys.start + ys.stop) / 2
        edge_x, edge_y = min(x / w, 1 - x / w), min(y / h, 1 - y / h)
        if edge_x < .35 and edge_y < .35:
            group = 2 * int(y > h / 2) + int(x > w / 2)
            groups[group].append((edge_x + edge_y, (x, y), area))
    # Shortlist by distance to the image corner to bound work on a busy background.
    return [sorted(group)[:6] for group in groups]


def _perspective(source, target):
    """Eight coefficients mapping the four source points to the target points."""
    matrix = []
    for (x, y), (u, v) in zip(source, target):
        matrix.extend(([x, y, 1, 0, 0, 0, -x*u, -y*u],
                       [0, 0, 0, x, y, 1, -x*v, -y*v]))
    return np.linalg.solve(matrix, target.ravel())


def _has_heading(sheet):
    """Look for ink on each of the three printed lines above the alphabet."""
    for bounds in ((65, 47, 380, 101), (65, 131, 420, 159), (65, 174, 480, 202)):
        band = np.asarray(sheet.crop(bounds))
        paper = np.percentile(band, 90)
        if np.mean(band < paper - 40) < .08:
            return False
    return True


def aligned_scan(image):
    """Return an upright, grayscale WIDTH × HEIGHT sheet, or raise ValueError."""
    gray = ImageOps.exif_transpose(image).convert('L')
    preview = gray.copy()
    preview.thumbnail((1500, 1500))
    groups = _candidates(preview)
    r = MARK_SIZE / 2
    centers = np.array([(r, r), (WIDTH-r, r), (r, HEIGHT-r), (WIDTH-r, HEIGHT-r)])
    best_error, best_points = float('inf'), None
    for marks in product(*groups):
        points = np.array([m[1] for m in marks])
        try:
            a, b, c, d, e, f, g, h = _perspective(centers, points)
        except np.linalg.LinAlgError:
            continue
        # The local area scale of a perspective map is det(H) / (gx + hy + 1)^3.
        # A letter or speck near a missing corner rarely has the predicted square area.
        det = np.linalg.det([[a, b, c], [d, e, f], [g, h, 1]])
        denominator = centers @ [g, h] + 1
        if det <= 0 or np.any(denominator <= 0):
            continue
        expected = MARK_SIZE**2 * det / denominator**3
        error = np.max(np.abs(np.log([m[2] for m in marks] / expected)))
        if error < best_error:
            best_error, best_points = error, points
    if best_points is None or best_error > np.log(1.55):
        raise ValueError('Could not match all four corner squares. Photograph the sheet upright '
                         'and fill the frame, keeping all four squares clear and visible.')
    points = best_points * [gray.width / preview.width, gray.height / preview.height]
    # All four markers look alike. Find the printed heading before assigning letters
    # to the cells. Checking just its upper-left rectangle keeps each trial cheap.
    for order in ([0, 1, 2, 3], [3, 2, 1, 0], [1, 3, 0, 2], [2, 0, 3, 1]):
        coeffs = _perspective(centers, points[order])
        heading = gray.transform((480, 202), Image.Transform.PERSPECTIVE, coeffs,
                                 resample=Image.Resampling.BILINEAR, fillcolor=255)
        if _has_heading(heading):
            return gray.transform((WIDTH, HEIGHT), Image.Transform.PERSPECTIVE, coeffs,
                                  resample=Image.Resampling.BICUBIC, fillcolor=255)
    raise ValueError('Could not find the printed heading. Use the full personal handwriting '
                     'sheet with its heading and four corner squares visible.')
