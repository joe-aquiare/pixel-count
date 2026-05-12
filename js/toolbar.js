export function setupToolbar({
  uploadBtn,
  exportBtn,
  zoomInBtn,
  zoomOutBtn,
  resetZoomBtn,
  mosaicBtn,
  gridVisBtn,
  deleteGridBtn,
  gridDecBtnX,
  gridIncBtnX,
  gridInputX,
  gridDecBtnY,
  gridIncBtnY,
  gridInputY,
  resolutionValue,
  fileInput,
  viewport,
}) {
  uploadBtn.addEventListener('click', () => fileInput.click());
  zoomInBtn.addEventListener('click', () => viewport.zoomIn());
  zoomOutBtn.addEventListener('click', () => viewport.zoomOut());
  resetZoomBtn.addEventListener('click', () => viewport.resetView());

  exportBtn.addEventListener('click', () => {
    const exportCanvas = viewport.exportNativeImage();
    if (!exportCanvas) return;
    exportCanvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pixelcount-${exportCanvas.width}x${exportCanvas.height}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    }, 'image/png');
  });

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

  deleteGridBtn.addEventListener('click', () => viewport.clearGrid());

  const clampGrid = (n) => {
    const x = Math.floor(Number(n));
    if (!Number.isFinite(x) || x < 1) return 1;
    return x;
  };

  const wireGridAxis = (input, decBtn, incBtn, apply) => {
    const applyValue = (n) => {
      const clamped = clampGrid(n);
      input.value = String(clamped);
      apply(clamped);
    };
    input.addEventListener('input', () => {
      const raw = input.value;
      if (raw === '') return;
      const x = Math.floor(Number(raw));
      if (Number.isFinite(x) && x >= 1) apply(x);
    });
    input.addEventListener('change', () => applyValue(input.value));
    input.addEventListener('blur', () => applyValue(input.value));
    decBtn.addEventListener('click', () => applyValue(Number(input.value) - 1));
    incBtn.addEventListener('click', () => applyValue(Number(input.value) + 1));
    applyValue(input.value);
  };

  wireGridAxis(gridInputX, gridDecBtnX, gridIncBtnX, viewport.setGridCellsX);
  wireGridAxis(gridInputY, gridDecBtnY, gridIncBtnY, viewport.setGridCellsY);

  const zoomButtons = [zoomInBtn, zoomOutBtn, resetZoomBtn];
  const setZoomEnabled = (enabled) => {
    zoomButtons.forEach((b) => { b.disabled = !enabled; });
  };
  setZoomEnabled(false);

  const setGridToolsAvailable = (available) => {
    mosaicBtn.disabled = !available;
    gridVisBtn.disabled = !available;
    exportBtn.disabled = !available;
    deleteGridBtn.disabled = !available;
    if (!available) setMosaicBtnActive(false);
  };
  setGridToolsAvailable(false);

  const setResolutionEstimate = (estimate) => {
    resolutionValue.textContent = estimate
      ? `${estimate.width} × ${estimate.height}`
      : '—';
  };
  setResolutionEstimate(null);

  return {
    setZoomEnabled,
    setGridToolsAvailable,
    setResolutionEstimate,
    setGridVisibility: setGridVisBtnActive,
  };
}
