import { setupImageLoader } from './imageLoader.js';
import { createViewport } from './viewport.js';
import { setupToolbar } from './toolbar.js';
import { setupGridTransform } from './gridTransform.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvas');
const uploadBtn = document.getElementById('uploadBtn');
const exportBtn = document.getElementById('exportBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const mosaicBtn = document.getElementById('mosaicBtn');
const gridVisBtn = document.getElementById('gridVisBtn');
const deleteGridBtn = document.getElementById('deleteGridBtn');
const gridDecBtnX = document.getElementById('gridDecBtnX');
const gridIncBtnX = document.getElementById('gridIncBtnX');
const gridInputX = document.getElementById('gridInputX');
const gridDecBtnY = document.getElementById('gridDecBtnY');
const gridIncBtnY = document.getElementById('gridIncBtnY');
const gridInputY = document.getElementById('gridInputY');
const gridOpacityInput = document.getElementById('gridOpacityInput');
const gridColorInput = document.getElementById('gridColorInput');
const floatingStack = document.getElementById('floatingStack');
const resolutionValue = document.getElementById('resolutionValue');
const sourceResolution = document.getElementById('sourceResolution');
const cursorPosition = document.getElementById('cursorPosition');
const pixelPosition = document.getElementById('pixelPosition');

const topOutBtn = document.getElementById('topOutBtn');
const topInBtn = document.getElementById('topInBtn');
const bottomOutBtn = document.getElementById('bottomOutBtn');
const bottomInBtn = document.getElementById('bottomInBtn');
const leftOutBtn = document.getElementById('leftOutBtn');
const leftInBtn = document.getElementById('leftInBtn');
const rightOutBtn = document.getElementById('rightOutBtn');
const rightInBtn = document.getElementById('rightInBtn');
const nudgeDecBtn = document.getElementById('nudgeDecBtn');
const nudgeIncBtn = document.getElementById('nudgeIncBtn');
const nudgeInput = document.getElementById('nudgeInput');

let toolbar;
let gridTransform;
const viewport = createViewport(canvas, {
  onGridChange: (estimate) => {
    const hasGrid = estimate !== null;
    toolbar?.setResolutionEstimate(estimate);
    toolbar?.setGridToolsAvailable(hasGrid);
    gridTransform?.setAvailable(hasGrid);
    floatingStack.classList.toggle('hidden', !hasGrid);
  },
  onGridVisibilityChange: (visible) => toolbar?.setGridVisibility(visible),
  onCursorMove: ({ imageX, imageY, pixelX, pixelY }) => {
    cursorPosition.textContent = `${imageX}, ${imageY}`;
    pixelPosition.textContent = (pixelX !== null && pixelY !== null)
      ? `${pixelX}, ${pixelY}`
      : '—';
  },
});

toolbar = setupToolbar({
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
});

gridTransform = setupGridTransform({
  topOutBtn,
  topInBtn,
  bottomOutBtn,
  bottomInBtn,
  leftOutBtn,
  leftInBtn,
  rightOutBtn,
  rightInBtn,
  nudgeDecBtn,
  nudgeIncBtn,
  nudgeInput,
  viewport,
});

gridOpacityInput.addEventListener('input', (e) => {
  viewport.setGridOpacity(parseFloat(e.target.value));
});

gridColorInput.addEventListener('input', (e) => {
  viewport.setGridColor(e.target.value);
});

const initColoris = () => {
  if (typeof window.Coloris !== 'function') return;
  try {
    window.Coloris({
      el: '#gridColorInput',
      themeMode: 'dark',
      format: 'hex',
      alpha: false,
      swatches: ['#78d2ff', '#ff6b6b', '#ffd166', '#06d6a0', '#ef476f', '#ffffff'],
    });
  } catch (err) {
    console.warn('Coloris configuration error:', err);
  }
};

// Coloris creates its picker DOM on DOMContentLoaded. Module scripts execute
// in readyState='interactive', *before* DOMContentLoaded fires, so a synchronous
// Coloris({...}) call here would touch the not-yet-created picker root.
// `load` fires strictly after DOMContentLoaded, so Coloris is guaranteed ready.
if (document.readyState === 'complete') {
  initColoris();
} else {
  window.addEventListener('load', initColoris);
}

// Prevent buttons from retaining focus after mouse clicks. Otherwise a
// focused button captures Space (treated as "activate") and shows a focus
// ring, both of which interfere with the Space-to-pan flow. Keyboard tab
// focus is preserved because that path doesn't go through mousedown.
document.addEventListener('mousedown', (e) => {
  if (e.target.closest('.tool-btn, .step-btn, .transform-btn')) {
    e.preventDefault();
  }
});

const isTypingInInput = () => {
  const tag = document.activeElement?.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA';
};

const getNudge = () => {
  const n = Number(nudgeInput.value);
  if (!Number.isFinite(n) || n < 0.01) return 0.01;
  return n;
};

const clickIfActive = (btn) => {
  if (btn.disabled) return;
  btn.click();
};

document.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.altKey || e.metaKey) return;
  if (isTypingInInput()) return;

  switch (e.key) {
    case '+':
    case '=':
      clickIfActive(zoomInBtn);
      e.preventDefault();
      break;
    case '-':
    case '_':
      clickIfActive(zoomOutBtn);
      e.preventDefault();
      break;
    case '1':
      clickIfActive(resetZoomBtn);
      e.preventDefault();
      break;
    case 'u':
    case 'U':
      clickIfActive(uploadBtn);
      e.preventDefault();
      break;
    case 'e':
    case 'E':
      clickIfActive(exportBtn);
      e.preventDefault();
      break;
    case 'm':
    case 'M':
      clickIfActive(mosaicBtn);
      e.preventDefault();
      break;
    case 'g':
    case 'G':
      clickIfActive(gridVisBtn);
      e.preventDefault();
      break;
    case 'x':
    case 'X':
      clickIfActive(deleteGridBtn);
      e.preventDefault();
      break;
    case 'a':
    case 'A':
      clickIfActive(gridDecBtnX);
      e.preventDefault();
      break;
    case 'd':
    case 'D':
      clickIfActive(gridIncBtnX);
      e.preventDefault();
      break;
    case 'w':
    case 'W':
      clickIfActive(gridIncBtnY);
      e.preventDefault();
      break;
    case 's':
    case 'S':
      clickIfActive(gridDecBtnY);
      e.preventDefault();
      break;
    case 'ArrowLeft':
      viewport.translateGrid(-getNudge(), 0);
      e.preventDefault();
      break;
    case 'ArrowRight':
      viewport.translateGrid(getNudge(), 0);
      e.preventDefault();
      break;
    case 'ArrowUp':
      viewport.translateGrid(0, -getNudge());
      e.preventDefault();
      break;
    case 'ArrowDown':
      viewport.translateGrid(0, getNudge());
      e.preventDefault();
      break;
  }
});

setupImageLoader({
  dropzone,
  fileInput,
  onImageLoaded: (img) => {
    dropzone.classList.add('hidden');
    sourceResolution.textContent = `${img.width} × ${img.height}`;
    viewport.setImage(img);
    toolbar.setZoomEnabled(true);
  },
});
