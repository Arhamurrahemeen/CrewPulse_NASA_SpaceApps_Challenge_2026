# Adapted from VitalSense (https://github.com/Arhamurrahemeen/VitalSense, commit 61a0b0ccb07cf1a3ac8cc22252e86edb62f97e21), MIT License,
# by Muhammad Arham. Prior open-source work reused with permission of the Karachi Local Lead.
# Change: removed plot_frequency_response and the matplotlib dependency (server has no plotting).
"""Core DSP utilities for VitalSense.

This module stays strictly focused on NumPy/SciPy signal processing:
Butterworth bandpass filter design, zero-phase filtering, FFT-based BPM
extraction, confidence scoring, and a static frequency-response plot.

The upstream VitalSense signal extractor uses the green channel because the
pulsatile rPPG component is typically strongest there (Verkruysse et al., 2008).
Poh et al. (2010) describe FFT-based heart-rate estimation from the dominant
spectral peak in the cardiac band.
"""

from __future__ import annotations

import logging
from typing import Tuple

import numpy as np
from scipy import signal as sp_signal

logger = logging.getLogger(__name__)

FS = 30
LOW = 0.7
HIGH = 4.0

# A spectral peak at or above this many dB above the in-band noise floor is
# treated as a reliable heart-rate estimate. 3 dB is the standard "half-power"
# significance point (peak power is at least double the average noise power)
# used to judge whether a peak stands out from noise. Retune once real
# recordings are available to calibrate against ground truth.
CONFIDENCE_DB_THRESHOLD = 3.0

# Available rPPG extraction methods, in the order they appear in the paper's
# comparison table. "green" is the original method and stays the default.
PULSE_METHODS = ("green", "pos", "chrom")
DEFAULT_METHOD = "green"

__all__ = [
    "FS",
    "LOW",
    "HIGH",
    "CONFIDENCE_DB_THRESHOLD",
    "PULSE_METHODS",
    "DEFAULT_METHOD",
    "pos",
    "chrom",
    "extract_pulse_signal",
    "design_bandpass",
    "apply_filter",
    "compute_bpm_and_confidence",
]


def _log_dsp_error(operation: str, error: Exception, fallback: str) -> None:
    """Log VitalSense DSP errors in the required three-part format.

    Args:
        operation: The operation that failed.
        error: The exception that caused the failure.
        fallback: The fallback strategy applied after the failure.

    Returns:
        None.
    """
    logger.exception(
        "DSP error | what failed=%s | what caused it=%s | fallback=%s",
        operation,
        error,
        fallback,
    )


def design_bandpass(low: float, high: float, fs: float, order: int = 2) -> np.ndarray:
    """Design a Butterworth bandpass filter in SOS form.

    SciPy best practice is to use Second-Order Sections for IIR filters because
    SOS reduces numerical instability compared with a single transfer-function
    polynomial representation, especially as filter order increases.

    Args:
        low: Low cutoff frequency in Hz.
        high: High cutoff frequency in Hz.
        fs: Sampling rate in Hz.
        order: Butterworth filter order.

    Returns:
        A NumPy array containing SOS filter coefficients. Returns an empty SOS
        array if filter design fails.
    """
    fallback = "return an empty SOS array so downstream code can skip filtering"

    try:
        sos = sp_signal.butter(
            order,
            [low, high],
            btype="bandpass",
            fs=fs,
            output="sos",
        )
        return np.asarray(sos, dtype=float)

    except Exception as exc:
        _log_dsp_error("design_bandpass", exc, fallback)
        return np.empty((0, 6), dtype=float)


def apply_filter(signal: np.ndarray, sos: np.ndarray) -> np.ndarray:
    """Apply zero-phase bandpass filtering to the input signal.

    The signal is detrended first by removing its mean so lighting-induced DC
    offset does not dominate the cardiac component. Zero-phase filtering uses
    sosfiltfilt instead of lfilter so the output is not time-shifted.

    Args:
        signal: One-dimensional NumPy array containing the raw rPPG signal.
        sos: SOS coefficients from design_bandpass().

    Returns:
        A filtered NumPy array. For short or invalid inputs, returns a detrended
        fallback signal rather than raising an exception.
    """
    fallback = "return the detrended signal unchanged because filtering is unsafe"

    try:
        samples = np.asarray(signal, dtype=float).ravel()

        if samples.size == 0:
            raise ValueError("signal is empty")

        detrended = samples - float(np.mean(samples))

        if samples.size < 20:
            # Short sequences do not provide enough padding for sosfiltfilt.
            return detrended

        sos_array = np.asarray(sos, dtype=float)
        if sos_array.size == 0:
            raise ValueError("SOS coefficients are empty")

        return sp_signal.sosfiltfilt(sos_array, detrended)

    except Exception as exc:
        _log_dsp_error("apply_filter", exc, fallback)
        try:
            samples = np.asarray(signal, dtype=float).ravel()
            return samples - float(np.mean(samples)) if samples.size else np.asarray([], dtype=float)
        except Exception as inner_exc:
            _log_dsp_error(
                "apply_filter fallback",
                inner_exc,
                "return an empty array because the input could not be normalized",
            )
            return np.asarray([], dtype=float)


def compute_bpm_and_confidence(
    filtered_signal: np.ndarray,
    fs: float = FS,
    low: float = LOW,
    high: float = HIGH,
) -> Tuple[int, float]:
    """Estimate BPM and spectral SNR from a filtered rPPG signal.

    The algorithm uses np.fft.rfft and np.fft.rfftfreq to analyze the real FFT,
    restricts analysis to the cardiac band, finds the strongest spectral peak,
    and converts that peak frequency to BPM.

    Args:
        filtered_signal: One-dimensional filtered signal from apply_filter().
        fs: Sampling rate in Hz.
        low: Low cutoff frequency in Hz.
        high: High cutoff frequency in Hz.

    Returns:
        A tuple of (bpm, confidence_db), where confidence_db is the peak's
        signal-to-noise ratio in decibels relative to the in-band noise floor.
        If no valid peak is found, returns (0, 0.0).
    """
    fallback = "return (0, 0.0) because the signal or spectrum is not reliable"

    try:
        samples = np.asarray(filtered_signal, dtype=float).ravel()
        samples = samples[np.isfinite(samples)]

        if samples.size < 4:
            raise ValueError(f"signal length {samples.size} is too short for FFT analysis")

        centered = samples - float(np.mean(samples))

        fft_values = np.fft.rfft(centered)
        fft_freqs = np.fft.rfftfreq(centered.size, d=1.0 / fs)
        magnitudes = np.abs(fft_values)
        band_mask = (fft_freqs >= low) & (fft_freqs <= high)

        if not np.any(band_mask):
            raise ValueError("no FFT bins fall inside the cardiac band")

        band_freqs = fft_freqs[band_mask]
        band_power = magnitudes[band_mask] ** 2

        if band_power.size < 2:
            raise ValueError("insufficient band resolution to determine peak confidence")

        peak_index = int(np.argmax(band_power))
        peak_power = float(band_power[peak_index])
        peak_freq = float(band_freqs[peak_index])

        if not np.isfinite(peak_freq) or peak_freq <= 0.0 or peak_power <= 0.0:
            raise ValueError("peak frequency or peak power is invalid")

        # Poh et al. (2010): estimate heart rate from the dominant FFT peak in
        # the cardiac band after band-limited spectral analysis.
        noise_candidates = np.delete(band_power, peak_index)
        noise_power = float(np.mean(noise_candidates)) if noise_candidates.size else peak_power
        noise_power = max(noise_power, np.finfo(float).eps)

        bpm_value = peak_freq * 60.0
        confidence_db = 10.0 * np.log10(peak_power / noise_power)

        bpm = int(round(bpm_value))
        confidence = round(confidence_db, 1)

        if bpm <= 0:
            return 0, 0.0

        return bpm, confidence

    except Exception as exc:
        _log_dsp_error("compute_bpm_and_confidence", exc, fallback)
        return 0, 0.0


def _green_column(rgb: np.ndarray) -> np.ndarray:
    """Return the green channel of an (N, 3) RGB array as the failure sentinel.

    Args:
        rgb: Array expected to be (N, 3) in RGB order.

    Returns:
        The green column, or an empty array if the input is not (N, 3).
    """
    try:
        array = np.asarray(rgb, dtype=float)
        if array.ndim == 2 and array.shape[1] == 3:
            return array[:, 1].copy()
        return np.asarray([], dtype=float)
    except Exception:
        return np.asarray([], dtype=float)


def pos(rgb: np.ndarray, fs: float = FS) -> np.ndarray:
    """Extract a pulse signal using POS (Wang et al. 2016, Algorithm 1).

    POS projects the temporally normalized RGB trace onto a plane orthogonal to
    the skin-tone direction. Both rows of the projection matrix sum to zero, so
    any component identical across all three channels — specular reflection,
    most illumination change — is annihilated rather than filtered.

    Args:
        rgb: An (N, 3) array of per-frame channel means in RGB order.
        fs: Sampling rate in Hz.

    Returns:
        A 1-D pulse signal of length N. On failure, returns the green column
        (empty if the input is not (N, 3)) rather than raising.
    """
    fallback = "return the green channel because POS projection failed"

    try:
        channels = np.asarray(rgb, dtype=float)

        if channels.ndim != 2 or channels.shape[1] != 3:
            raise ValueError(f"expected an (N, 3) RGB array, got shape {channels.shape}")

        frame_count = channels.shape[0]
        window = int(np.ceil(1.6 * fs))

        if frame_count < window:
            raise ValueError(f"need at least {window} frames for POS, got {frame_count}")

        pulse = np.zeros(frame_count, dtype=float)

        # ponytail: per-window Python loop, ~450 iterations for a 15 s buffer at
        # 30 fps. Vectorise with stride tricks only if profiling shows it matters.
        for end in range(window, frame_count + 1):
            start = end - window
            segment = channels[start:end]
            means = segment.mean(axis=0)

            if np.any(means == 0.0):
                continue

            normalized = segment / means

            # Projection P = [[0, 1, -1], [-2, 1, 1]] in RGB order.
            s1 = normalized[:, 1] - normalized[:, 2]
            s2 = -2.0 * normalized[:, 0] + normalized[:, 1] + normalized[:, 2]

            s2_std = float(np.std(s2))
            alpha = float(np.std(s1)) / s2_std if s2_std > 0.0 else 0.0

            combined = s1 + alpha * s2
            pulse[start:end] += combined - float(np.mean(combined))

        return pulse

    except Exception as exc:
        _log_dsp_error("pos", exc, fallback)
        return _green_column(rgb)


def chrom(rgb: np.ndarray, fs: float = FS) -> np.ndarray:
    """Extract a pulse signal using CHROM (de Haan & Jeanne 2013).

    CHROM builds two chrominance signals from a standardized skin-tone
    assumption and subtracts one from the other, scaled so their motion-induced
    components cancel. Windowed with 50% overlap and Hann weighting, per the
    paper's practical formulation.

    Args:
        rgb: An (N, 3) array of per-frame channel means in RGB order.
        fs: Sampling rate in Hz.

    Returns:
        A 1-D pulse signal of length N. On failure, returns the green column
        (empty if the input is not (N, 3)) rather than raising.
    """
    fallback = "return the green channel because CHROM projection failed"

    try:
        channels = np.asarray(rgb, dtype=float)

        if channels.ndim != 2 or channels.shape[1] != 3:
            raise ValueError(f"expected an (N, 3) RGB array, got shape {channels.shape}")

        frame_count = channels.shape[0]
        window = int(np.ceil(1.6 * fs))

        if frame_count < window:
            raise ValueError(f"need at least {window} frames for CHROM, got {frame_count}")

        step = max(1, window // 2)
        sos = design_bandpass(LOW, HIGH, fs, order=2)
        hann = np.hanning(window)
        pulse = np.zeros(frame_count, dtype=float)

        for start in range(0, frame_count - window + 1, step):
            end = start + window
            segment = channels[start:end]
            means = segment.mean(axis=0)

            if np.any(means == 0.0):
                continue

            normalized = segment / means

            # de Haan & Jeanne (2013) chrominance projections.
            x_raw = 3.0 * normalized[:, 0] - 2.0 * normalized[:, 1]
            y_raw = 1.5 * normalized[:, 0] + normalized[:, 1] - 1.5 * normalized[:, 2]

            x_filtered = apply_filter(x_raw, sos)
            y_filtered = apply_filter(y_raw, sos)

            y_std = float(np.std(y_filtered))
            alpha = float(np.std(x_filtered)) / y_std if y_std > 0.0 else 0.0

            segment_pulse = x_filtered - alpha * y_filtered
            segment_std = float(np.std(segment_pulse))

            if segment_std > 0.0:
                segment_pulse = (segment_pulse - float(np.mean(segment_pulse))) / segment_std

            pulse[start:end] += hann * segment_pulse

        return pulse

    except Exception as exc:
        _log_dsp_error("chrom", exc, fallback)
        return _green_column(rgb)


def extract_pulse_signal(
    rgb: np.ndarray,
    method: str = DEFAULT_METHOD,
    fs: float = FS,
) -> np.ndarray:
    """Extract a 1-D pulse signal from RGB channel means using the named method.

    Args:
        rgb: An (N, 3) array of per-frame channel means in RGB order.
        method: One of PULSE_METHODS.
        fs: Sampling rate in Hz.

    Returns:
        A 1-D pulse signal. On any failure — bad shape, unknown method, or an
        error inside the chosen method — returns the green column rather than
        raising, so the camera loop always has something to filter.
    """
    fallback = "return the green channel because pulse extraction failed"

    try:
        channels = np.asarray(rgb, dtype=float)

        if channels.ndim != 2 or channels.shape[1] != 3:
            raise ValueError(f"expected an (N, 3) RGB array, got shape {channels.shape}")

        if method == "green":
            return channels[:, 1].copy()
        if method == "pos":
            return pos(channels, fs)
        if method == "chrom":
            return chrom(channels, fs)

        raise ValueError(f"unknown method {method!r}, expected one of {PULSE_METHODS}")

    except Exception as exc:
        _log_dsp_error("extract_pulse_signal", exc, fallback)
        return _green_column(rgb)

