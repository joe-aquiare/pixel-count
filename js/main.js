import { setupImageLoader } from './imageLoader.js';
import { createViewport } from './viewport.js';
import { setupToolbar } from './toolbar.js';
import { setupGridTransform } from './gridTransform.js';

const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('fileInput');
const canvas = document.getElementById('canvas');
const uploadBtn = document.getElementById('uploadBtn');
const zoomInBtn = document.getElementById('zoomInBtn');
const zoomOutBtn = document.getElementById('zoomOutBtn');
const resetZoomBtn = document.getElementById('resetZoomBtn');
const mosaicBtn = document.getElementById('mosaicBtn');
const gridVisBtn = document.getElementById('gridVisBtn');
const gridDecBtn = document.getElementById('gridDecBtn');
const gridIncBtn = document.getElementById('gridIncBtn');
const gridInput = document.getElementById('gridInput');
const floatingStack = document.getElementById('floatingStack');
const resolutionValue = document.getElementById('resolutionValue');
const predictedValue = document.getElementById('predictedValue');

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
    toolbar?.setResolutionEstimate(estimate);
    gridTransform?.setAvailable(estimate !== null);
  },
  onGridVisibilityChange: (visible) => toolbar?.setGridVisibility(visible),
});

toolbar = setupToolbar({
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

setupImageLoader({
  dropzone,
  fileInput,
  onImageLoaded: (img) => {
    dropzone.classList.add('hidden');
    floatingStack.classList.remove('hidden');
    viewport.setImage(img);
    toolbar.setZoomEnabled(true);
  },
});
