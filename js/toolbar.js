import { findClosestResolution } from './commonResolutions.js';

export function setupToolbar({
  uploadBtn,
  zoomInBtn,
  zoomOutBtn,
  resetZoomBtn,
  mosaicBtn,
  gridVisBtn,
  gridDecBtn,
  gridIncBtn,
  gridInput,
  resolutionValue,
  predictedValue,
  fileInput,
  viewport,
}) {
  uploadBtn.addEventListener('click', () => fileInput.click());
  zoomInBtn.addEventListener('click', () => viewport.zoomIn());
  zoomOutBtn.addEventListener('click', () => viewport.zoomOut());
  resetZoomBtn.addEventListener('click', () => viewport.resetView());

  const setMosaicBtnActive = (active) => {
    mosaicBtn.classList.toggle('active', active);
    mosaicBtn.setAttribute('aria-pressed', active ? 'true' : 'false');
  };
  const setGridVisBtnActive = (visible) => {
    gridVisBtn.classList.toggle('active', visible);
    gridVisBtn.setAttribute('aria-pressed', visible ? 'true' : 'false');
  };

  mosaicBtn.addEventListener('click', () => {
    const next = !viewport.getMosaicEnabled();
    const applied = viewport.setMosaicEnabled(next);
    setMosaicBtnActive(applied);
  });

  gridVisBtn.addEventListener('click', () => {
    const next = !viewport.getGridVisible();
    viewport.setGridVisible(next);
    setGridVisBtnActive(next);
  });

  const clampGrid = (n) => {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 1) return 1;
    return x;
  };

  const applyGrid = (n) => {
    const clamped = clampGrid(n);
    gridInput.value = String(clamped);
    viewport.setGridCells(clamped);
  };

  gridInput.addEventListener('input', () => {
    const raw = gridInput.value;
    if (raw === '') return; // let the user clear while typing
    const x = Math.floor(Number(raw));
    if (Number.isFinite(x) && x >= 1) {
      viewport.setGridCells(x);
    }
  });
  gridInput.addEventListener('change', () => applyGrid(gridInput.value));
  gridInput.addEventListener('blur', () => applyGrid(gridInput.value));

  gridDecBtn.addEventListener('click', () => applyGrid(Number(gridInput.value) - 1));
  gridIncBtn.addEventListener('click', () => applyGrid(Number(gridInput.value) + 1));

  applyGrid(gridInput.value);

  const zoomButtons = [zoomInBtn, zoomOutBtn, resetZoomBtn];
  const setZoomEnabled = (enabled) => {
    zoomButtons.forEach((b) => { b.disabled = !enabled; });
  };
  setZoomEnabled(false);

  const setGridToolsAvailable = (available) => {
    mosaicBtn.disabled = !available;
    gridVisBtn.disabled = !available;
  };
  setGridToolsAvailable(false);

  const setResolutionEstimate = (estimate) => {
    resolutionValue.textContent = estimate
      ? `${estimate.width} × ${estimate.height}`
      : '—';
    const predicted = findClosestResolution(estimate);
    predictedValue.textContent = predicted
      ? `${predicted.width} × ${predicted.height} (${predicted.aspect})`
      : '—';
    setGridToolsAvailable(estimate !== null);
    if (estimate === null) setMosaicBtnActive(false);
  };
  setResolutionEstimate(null);

  return {
    setZoomEnabled,
    setResolutionEstimate,
    setGridVisibility: setGridVisBtnActive,
  };
}
