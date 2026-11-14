# Adapted from VitalSense (https://github.com/Arhamurrahemeen/VitalSense, commit 61a0b0ccb07cf1a3ac8cc22252e86edb62f97e21), MIT License,
# by Muhammad Arham. Prior open-source work reused with permission of the Karachi Local Lead.
"""Forehead ROI extraction shared by the live monitor and the benchmark.

Kept separate from main.py so the benchmark can measure the same region the
app measures without importing the orchestrator, whose module-level code
constructs the feedback manager and registers shutdown handlers.
"""

from __future__ import annotations

import logging

import cv2
import numpy as np

logger = logging.getLogger(__name__)

# Forehead landmarks used for a stable ROI over the upper face. This is a
# specific stable MediaPipe landmark set — changing it changes ROI stability.
FOREHEAD_IDS = [10, 109, 67, 103, 338, 297, 332, 284]

__all__ = ["FOREHEAD_IDS", "extract_forehead_roi", "get_rgb_signal"]


def _log_roi_error(operation: str, error: Exception, fallback: str) -> None:
    """Log ROI errors in the VitalSense three-part format.

    Args:
        operation: The operation that failed.
        error: The exception that caused the failure.
        fallback: The fallback strategy applied after the failure.

    Returns:
        None.
    """
    logger.exception(
        "ROI error | what failed=%s | what caused it=%s | fallback=%s",
        operation,
        error,
        fallback,
    )


def extract_forehead_roi(
    frame: np.ndarray,
    landmarks,
) -> tuple[np.ndarray | None, tuple[int, int, int, int] | None]:
    """Extract a forehead ROI from the current face landmarks.

    Args:
        frame: Current BGR video frame.
        landmarks: MediaPipe normalized face landmarks for one face.

    Returns:
        A tuple of (roi, bounding_box). Returns (None, None) if the ROI cannot
        be extracted.
    """
    fallback = "skip ROI extraction and wait for the next valid face frame"

    try:
        if frame is None or landmarks is None:
            raise ValueError("frame or landmarks are missing")

        height, width = frame.shape[:2]
        points = np.array(
            [(int(landmarks[i].x * width), int(landmarks[i].y * height)) for i in FOREHEAD_IDS],
            dtype=np.int32,
        )

        x, y, roi_width, roi_height = cv2.boundingRect(points)

        x0 = max(0, x)
        y0 = max(0, y)
        x1 = min(width, x + roi_width)
        y1 = min(height, y + roi_height)

        if x1 <= x0 or y1 <= y0:
            raise ValueError("computed ROI bounds are degenerate")

        region = frame[y0:y1, x0:x1]
        if region.size == 0:
            raise ValueError("ROI slice is empty")

        return region, (x0, y0, x1 - x0, y1 - y0)

    except Exception as exc:
        _log_roi_error("extract_forehead_roi", exc, fallback)
        return None, None


def get_rgb_signal(region: np.ndarray) -> tuple[float, float, float]:
    """Compute per-channel mean intensities from a forehead ROI.

    Args:
        region: Cropped forehead region in OpenCV BGR order.

    Returns:
        A tuple of (red, green, blue) means, or (0.0, 0.0, 0.0) on failure.
    """
    fallback = "return (0.0, 0.0, 0.0) because the ROI is invalid"

    try:
        if region is None or region.size == 0:
            raise ValueError("ROI is empty")

        # OpenCV frames are BGR. Every downstream consumer — POS, CHROM, the
        # dashboard — assumes RGB, so the conversion happens once, here.
        blue, green, red = (float(np.mean(region[:, :, channel])) for channel in range(3))
        return red, green, blue

    except Exception as exc:
        _log_roi_error("get_rgb_signal", exc, fallback)
        return 0.0, 0.0, 0.0
