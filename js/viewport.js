const MIN_SCALE = 0.2;
const MAX_SCALE = 10.0;
const ZOOM_FACTOR = 1.25;
const HANDLE_HIT_PX = 8;
const HANDLE_DRAW_PX = 7;
const OUTSIDE_CROP_ALPHA = 0.1;
const MIN_CROP_SIZE = 1;

const CURSOR_FOR_HANDLE = {
  tl: 'nwse-resize',
  br: 'nwse-resize',
  tr: 'nesw-resize',
  bl: 'nesw-resize',
  t: 'ns-resize',
  b: 'ns-resize',
  l: 'ew-resize',
  r: 'ew-resize',
};

const GRID_FILL_ALPHA = 0.12;
const GRID_LINE_ALPHA = 0.6;
const GRID_LINE_LIGHT_ALPHA = 0.22;
const GRID_BORDER_ALPHA = 0.95;
const GRID_HANDLE_ALPHA = 1;

const CROP_BORDER = 'rgba(140, 230, 130, 0.9)';
const CROP_HANDLE = 'rgba(140, 230, 130, 1)';

const HANDLE_STROKE = '#1e1e1e';

export function createViewport(canvas, {
  onGridChange = () => {},
  onGridVisibilityChange = () => {},
  onCursorMove = () => {},
  onCropChange = () => {},
} = {}) {
  const ctx = canvas.getContext('2d');

  let image = null;
  let imageData = null;
  let offsetX = 0;
  let offsetY = 0;
  let scale = 1;

  let spaceHeld = false;
  let panning = false;
  let panStartX = 0;
  let panStartY = 0;
  let offsetStartX = 0;
  let offsetStartY = 0;

  // Grid rect: user-drawn box, normalized between drags.
  let gridRect = null;
  let gridDragMode = null;
  let hoveredHandle = null;
  let hoveredGridBody = false;
  let gridMoveStartX = 0;
  let gridMoveStartY = 0;
  let gridMoveStartRect = null;
  let gridCellsX = 8;
  let gridCellsY = 8;
  let gridVisible = true;
  let gridColor = { r: 120, g: 210, b: 255 };
  let gridOpacity = 1;

  const gridRgba = (alpha) =>
    `rgba(${gridColor.r},${gridColor.g},${gridColor.b},${alpha * gridOpacity})`;

  const parseHexColor = (color) => {
    if (typeof color !== 'string') return null;
    let hex = color.trim().replace(/^#/, '');
    if (hex.length === 3) hex = hex.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) return null;
    return {
      r: parseInt(hex.slice(0, 2), 16),
      g: parseInt(hex.slice(2, 4), 16),
      b: parseInt(hex.slice(4, 6), 16),
    };
  };

  // Initialize transform-box border and background colors with default grid color
  const initializeTransformBoxColor = () => {
    const transformBox = document.querySelector('.transform-box');
    if (transformBox) {
      transformBox.style.borderColor = `rgba(${gridColor.r}, ${gridColor.g}, ${gridColor.b}, 0.85)`;
      transformBox.style.backgroundColor = `rgba(${gridColor.r}, ${gridColor.g}, ${gridColor.b}, 0.1)`;
    }
  };
  initializeTransformBoxColor();

  // Crop rect: defines the region of the image that counts as "active".
  // Initialized to the full image on load; clamped to image bounds.
  let cropRect = null;
  let cropDragMode = null;
  let hoveredCropHandle = null;

  let mosaicEnabled = false;
  let mosaicCanvas = null;
  let mosaicValid = false;

  const dpr = () => window.devicePixelRatio || 1;

  const screenToImage = (sx, sy) => ({
    x: (sx - offsetX) / scale,
    y: (sy - offsetY) / scale,
  });

  const imageToScreen = (ix, iy) => ({
    x: offsetX + ix * scale,
    y: offsetY + iy * scale,
  });

  const getCanvasCoords = (e) => {
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const normalizeRect = (rect) => {
    if (!rect) return;
    if (rect.x1 > rect.x2) [rect.x1, rect.x2] = [rect.x2, rect.x1];
    if (rect.y1 > rect.y2) [rect.y1, rect.y2] = [rect.y2, rect.y1];
  };

  const hitTestRect = (rect, sx, sy) => {
    if (!rect) return null;
    const a = imageToScreen(Math.min(rect.x1, rect.x2), Math.min(rect.y1, rect.y2));
    const b = imageToScreen(Math.max(rect.x1, rect.x2), Math.max(rect.y1, rect.y2));

    const nearL = Math.abs(sx - a.x) <= HANDLE_HIT_PX;
    const nearR = Math.abs(sx - b.x) <= HANDLE_HIT_PX;
    const nearT = Math.abs(sy - a.y) <= HANDLE_HIT_PX;
    const nearB = Math.abs(sy - b.y) <= HANDLE_HIT_PX;

    const inX = sx >= a.x - HANDLE_HIT_PX && sx <= b.x + HANDLE_HIT_PX;
    const inY = sy >= a.y - HANDLE_HIT_PX && sy <= b.y + HANDLE_HIT_PX;
    if (!inX || !inY) return null;

    if (nearT && nearL) return 'tl';
    if (nearT && nearR) return 'tr';
    if (nearB && nearL) return 'bl';
    if (nearB && nearR) return 'br';
    if (nearT) return 't';
    if (nearB) return 'b';
    if (nearL) return 'l';
    if (nearR) return 'r';
    return null;
  };

  const getHandleAt = (sx, sy) => {
    if (!gridRect || !gridVisible) return null;
    return hitTestRect(gridRect, sx, sy);
  };

  const isPointInGridBody = (sx, sy) => {
    if (!gridRect || !gridVisible) return false;
    const a = imageToScreen(Math.min(gridRect.x1, gridRect.x2), Math.min(gridRect.y1, gridRect.y2));
    const b = imageToScreen(Math.max(gridRect.x1, gridRect.x2), Math.max(gridRect.y1, gridRect.y2));
    return sx >= a.x && sx <= b.x && sy >= a.y && sy <= b.y;
  };

  const getCropHandleAt = (sx, sy) => {
    if (!cropRect) return null;
    return hitTestRect(cropRect, sx, sy);
  };

  const applyDragToRect = (mode, imgPt) => {
    if (!gridRect) return;
    switch (mode) {
      case 'create':
      case 'br':
        gridRect.x2 = imgPt.x; gridRect.y2 = imgPt.y; break;
      case 'tl':
        gridRect.x1 = imgPt.x; gridRect.y1 = imgPt.y; break;
      case 'tr':
        gridRect.x2 = imgPt.x; gridRect.y1 = imgPt.y; break;
      case 'bl':
        gridRect.x1 = imgPt.x; gridRect.y2 = imgPt.y; break;
      case 't':
        gridRect.y1 = imgPt.y; break;
      case 'b':
        gridRect.y2 = imgPt.y; break;
      case 'l':
        gridRect.x1 = imgPt.x; break;
      case 'r':
        gridRect.x2 = imgPt.x; break;
    }
  };

  const applyGridMove = (imgPt) => {
    if (!gridRect || !gridMoveStartRect) return;
    const dx = imgPt.x - gridMoveStartX;
    const dy = imgPt.y - gridMoveStartY;
    gridRect.x1 = gridMoveStartRect.x1 + dx;
    gridRect.x2 = gridMoveStartRect.x2 + dx;
    gridRect.y1 = gridMoveStartRect.y1 + dy;
    gridRect.y2 = gridMoveStartRect.y2 + dy;
  };

  const applyCropDrag = (mode, imgPt) => {
    if (!cropRect || !image) return;
    // Clamp the drag point to the image bounds — crop can't extend off-image.
    const cx = Math.max(0, Math.min(image.width, imgPt.x));
    const cy = Math.max(0, Math.min(image.height, imgPt.y));

    switch (mode) {
      case 'tl':
        cropRect.x1 = Math.min(cx, cropRect.x2 - MIN_CROP_SIZE);
        cropRect.y1 = Math.min(cy, cropRect.y2 - MIN_CROP_SIZE);
        break;
      case 'tr':
        cropRect.x2 = Math.max(cx, cropRect.x1 + MIN_CROP_SIZE);
        cropRect.y1 = Math.min(cy, cropRect.y2 - MIN_CROP_SIZE);
        break;
      case 'bl':
        cropRect.x1 = Math.min(cx, cropRect.x2 - MIN_CROP_SIZE);
        cropRect.y2 = Math.max(cy, cropRect.y1 + MIN_CROP_SIZE);
        break;
      case 'br':
        cropRect.x2 = Math.max(cx, cropRect.x1 + MIN_CROP_SIZE);
        cropRect.y2 = Math.max(cy, cropRect.y1 + MIN_CROP_SIZE);
        break;
      case 't':
        cropRect.y1 = Math.min(cy, cropRect.y2 - MIN_CROP_SIZE);
        break;
      case 'b':
        cropRect.y2 = Math.max(cy, cropRect.y1 + MIN_CROP_SIZE);
        break;
      case 'l':
        cropRect.x1 = Math.min(cx, cropRect.x2 - MIN_CROP_SIZE);
        break;
      case 'r':
        cropRect.x2 = Math.max(cx, cropRect.x1 + MIN_CROP_SIZE);
        break;
    }
  };

  const updateCursor = () => {
    if (panning) {
      canvas.style.cursor = 'grabbing';
    } else if (spaceHeld && image) {
      canvas.style.cursor = 'grab';
    } else if (cropDragMode) {
      canvas.style.cursor = CURSOR_FOR_HANDLE[cropDragMode] || '';
    } else if (gridDragMode === 'move') {
      canvas.style.cursor = 'move';
    } else if (gridDragMode && gridDragMode !== 'create') {
      canvas.style.cursor = CURSOR_FOR_HANDLE[gridDragMode] || '';
    } else if (hoveredCropHandle) {
      canvas.style.cursor = CURSOR_FOR_HANDLE[hoveredCropHandle];
    } else if (hoveredHandle) {
      canvas.style.cursor = CURSOR_FOR_HANDLE[hoveredHandle];
    } else if (hoveredGridBody) {
      canvas.style.cursor = 'move';
    } else {
      canvas.style.cursor = '';
    }
  };

  const resize = () => {
    const r = dpr();
    canvas.width = canvas.clientWidth * r;
    canvas.height = canvas.clientHeight * r;
    render();
  };

  const drawGrid = () => {
    if (!gridRect || !gridVisible) return;
    const a = imageToScreen(Math.min(gridRect.x1, gridRect.x2), Math.min(gridRect.y1, gridRect.y2));
    const b = imageToScreen(Math.max(gridRect.x1, gridRect.x2), Math.max(gridRect.y1, gridRect.y2));
    const w = b.x - a.x;
    const h = b.y - a.y;
    if (w < 1 || h < 1) return;

    const cellW = w / gridCellsX;
    const cellH = h / gridCellsY;

    // Light grid extending from the box edges to the crop bounds (not the
    // full image). Skipped when cells are too small to read.
    if (image && cropRect && cellW >= 3 && cellH >= 3) {
      const cropA = imageToScreen(Math.min(cropRect.x1, cropRect.x2), Math.min(cropRect.y1, cropRect.y2));
      const cropB = imageToScreen(Math.max(cropRect.x1, cropRect.x2), Math.max(cropRect.y1, cropRect.y2));
      const cw = cropB.x - cropA.x;
      const ch = cropB.y - cropA.y;

      ctx.save();
      ctx.beginPath();
      ctx.rect(cropA.x, cropA.y, cw, ch);
      ctx.rect(a.x, a.y, w, h);
      ctx.clip('evenodd');

      ctx.lineWidth = 1;
      ctx.strokeStyle = gridRgba(GRID_LINE_LIGHT_ALPHA);
      ctx.beginPath();

      const iMin = Math.ceil((cropA.x - a.x) / cellW);
      const iMax = Math.floor((cropB.x - a.x) / cellW);
      for (let i = iMin; i <= iMax; i++) {
        const x = a.x + i * cellW;
        ctx.moveTo(x, cropA.y);
        ctx.lineTo(x, cropB.y);
      }

      const jMin = Math.ceil((cropA.y - a.y) / cellH);
      const jMax = Math.floor((cropB.y - a.y) / cellH);
      for (let j = jMin; j <= jMax; j++) {
        const y = a.y + j * cellH;
        ctx.moveTo(cropA.x, y);
        ctx.lineTo(cropB.x, y);
      }

      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = gridRgba(GRID_FILL_ALPHA);
    ctx.fillRect(a.x, a.y, w, h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = gridRgba(GRID_LINE_ALPHA);
    ctx.beginPath();
    for (let i = 1; i < gridCellsX; i++) {
      const tx = a.x + cellW * i;
      ctx.moveTo(tx, a.y);
      ctx.lineTo(tx, a.y + h);
    }
    for (let j = 1; j < gridCellsY; j++) {
      const ty = a.y + cellH * j;
      ctx.moveTo(a.x, ty);
      ctx.lineTo(a.x + w, ty);
    }
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = gridRgba(GRID_BORDER_ALPHA);
    ctx.strokeRect(a.x, a.y, w, h);

    drawHandles(a, b, gridRgba(GRID_HANDLE_ALPHA));
  };

  const drawCrop = () => {
    if (!image || !cropRect) return;
    const a = imageToScreen(Math.min(cropRect.x1, cropRect.x2), Math.min(cropRect.y1, cropRect.y2));
    const b = imageToScreen(Math.max(cropRect.x1, cropRect.x2), Math.max(cropRect.y1, cropRect.y2));
    const w = b.x - a.x;
    const h = b.y - a.y;
    if (w < 1 || h < 1) return;

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = CROP_BORDER;
    ctx.strokeRect(a.x, a.y, w, h);

    drawHandles(a, b, CROP_HANDLE);
  };

  const drawHandles = (a, b, fill) => {
    const half = HANDLE_DRAW_PX / 2;
    const positions = [
      [a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y],
      [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y],
      [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2],
    ];
    ctx.fillStyle = fill;
    ctx.strokeStyle = HANDLE_STROKE;
    ctx.lineWidth = 1;
    for (const [px, py] of positions) {
      ctx.fillRect(px - half, py - half, HANDLE_DRAW_PX, HANDLE_DRAW_PX);
      ctx.strokeRect(px - half, py - half, HANDLE_DRAW_PX, HANDLE_DRAW_PX);
    }
  };

  const computeMosaic = () => {
    if (!image || !imageData || !gridRect) return;

    const w = image.width;
    const h = image.height;

    if (!mosaicCanvas || mosaicCanvas.width !== w || mosaicCanvas.height !== h) {
      mosaicCanvas = document.createElement('canvas');
      mosaicCanvas.width = w;
      mosaicCanvas.height = h;
    }
    const dctx = mosaicCanvas.getContext('2d');

    const bx1 = Math.min(gridRect.x1, gridRect.x2);
    const by1 = Math.min(gridRect.y1, gridRect.y2);
    const bx2 = Math.max(gridRect.x1, gridRect.x2);
    const by2 = Math.max(gridRect.y1, gridRect.y2);
    const cellW = (bx2 - bx1) / gridCellsX;
    const cellH = (by2 - by1) / gridCellsY;

    if (cellW < 0.5 || cellH < 0.5) {
      dctx.clearRect(0, 0, w, h);
      dctx.drawImage(image, 0, 0);
      mosaicValid = true;
      return;
    }

    // Per-output-pixel mosaic. Each output pixel is assigned to the cell that
    // contains its center (half-open interval [cellLeft, cellRight)), then
    // copies the byte exactly from the cell-center sample of the source. No
    // fillRect, no sub-pixel anti-aliasing, no boundary blending.
    const out = dctx.createImageData(w, h);
    const src32 = new Uint32Array(imageData.data.buffer);
    const dst32 = new Uint32Array(out.data.buffer);

    const sampleY = new Int32Array(h);
    for (let y = 0; y < h; y++) {
      const cellJ = Math.floor((y + 0.5 - by1) / cellH);
      const cellCenterY = by1 + (cellJ + 0.5) * cellH;
      let sy = Math.floor(cellCenterY);
      if (sy < 0) sy = 0;
      else if (sy >= h) sy = h - 1;
      sampleY[y] = sy;
    }

    const sampleX = new Int32Array(w);
    for (let x = 0; x < w; x++) {
      const cellI = Math.floor((x + 0.5 - bx1) / cellW);
      const cellCenterX = bx1 + (cellI + 0.5) * cellW;
      let sx = Math.floor(cellCenterX);
      if (sx < 0) sx = 0;
      else if (sx >= w) sx = w - 1;
      sampleX[x] = sx;
    }

    for (let y = 0; y < h; y++) {
      const srcRowStart = sampleY[y] * w;
      const dstRowStart = y * w;
      for (let x = 0; x < w; x++) {
        dst32[dstRowStart + x] = src32[srcRowStart + sampleX[x]];
      }
    }

    dctx.putImageData(out, 0, 0);
    mosaicValid = true;
  };

  const invalidateMosaic = () => {
    mosaicValid = false;
  };

  const drawSource = (alpha) => {
    const source = (mosaicEnabled && mosaicCanvas && gridRect) ? mosaicCanvas : image;
    if (alpha !== 1) ctx.globalAlpha = alpha;
    ctx.drawImage(source, offsetX, offsetY, image.width * scale, image.height * scale);
    if (alpha !== 1) ctx.globalAlpha = 1;
  };

  const render = () => {
    const r = dpr();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    ctx.imageSmoothingEnabled = false;

    if (image) {
      if (mosaicEnabled && gridRect && !mosaicValid) computeMosaic();

      if (!cropRect) {
        drawSource(1);
      } else {
        drawSource(OUTSIDE_CROP_ALPHA);
        const ca = imageToScreen(Math.min(cropRect.x1, cropRect.x2), Math.min(cropRect.y1, cropRect.y2));
        const cb = imageToScreen(Math.max(cropRect.x1, cropRect.x2), Math.max(cropRect.y1, cropRect.y2));
        const cw = cb.x - ca.x;
        const ch = cb.y - ca.y;
        if (cw > 0 && ch > 0) {
          ctx.save();
          ctx.beginPath();
          ctx.rect(ca.x, ca.y, cw, ch);
          ctx.clip();
          drawSource(1);
          ctx.restore();
        }
      }
    }

    drawGrid();
    drawCrop();
  };

  const centerImage = () => {
    if (!image) return;
    offsetX = (canvas.clientWidth - image.width * scale) / 2;
    offsetY = (canvas.clientHeight - image.height * scale) / 2;
  };

  const getResolutionEstimate = () => {
    if (!image || !gridRect || !cropRect) return null;
    const gw = Math.abs(gridRect.x2 - gridRect.x1);
    const gh = Math.abs(gridRect.y2 - gridRect.y1);
    if (gw < 1 || gh < 1) return null;
    const cw = Math.abs(cropRect.x2 - cropRect.x1);
    const ch = Math.abs(cropRect.y2 - cropRect.y1);
    return {
      width: Math.round((cw * gridCellsX) / gw),
      height: Math.round((ch * gridCellsY) / gh),
    };
  };

  const fireGridChange = () => onGridChange(getResolutionEstimate());

  const getCropAmounts = () => {
    if (!image || !cropRect) return null;
    normalizeRect(cropRect);
    return {
      top: cropRect.y1,
      bottom: image.height - cropRect.y2,
      left: cropRect.x1,
      right: image.width - cropRect.x2,
    };
  };

  const fireCropChange = () => onCropChange(getCropAmounts());

  const getPixelPosition = (imageX, imageY) => {
    if (!gridRect || !image) return { x: null, y: null };
    const bx1 = Math.min(gridRect.x1, gridRect.x2);
    const by1 = Math.min(gridRect.y1, gridRect.y2);
    const bx2 = Math.max(gridRect.x1, gridRect.x2);
    const by2 = Math.max(gridRect.y1, gridRect.y2);
    const cellW = (bx2 - bx1) / gridCellsX;
    const cellH = (by2 - by1) / gridCellsY;
    if (cellW < 0.0001 || cellH < 0.0001) return { x: null, y: null };
    // Pixel (0,0) is anchored to the image's top-left, using the cell size
    // derived from the user's grid box. Clamp to the grid's resolution within
    // the image so the value never exceeds the addressable cell range.
    const maxX = Math.max(0, Math.round(image.width / cellW) - 1);
    const maxY = Math.max(0, Math.round(image.height / cellH) - 1);
    return {
      x: Math.max(0, Math.min(maxX, Math.floor(imageX / cellW))),
      y: Math.max(0, Math.min(maxY, Math.floor(imageY / cellH))),
    };
  };

  canvas.addEventListener('mousemove', (e) => {
    if (!image) return;
    const c = getCanvasCoords(e);
    const imgPos = screenToImage(c.x, c.y);
    const clampedX = Math.max(0, Math.min(image.width - 1, Math.floor(imgPos.x)));
    const clampedY = Math.max(0, Math.min(image.height - 1, Math.floor(imgPos.y)));
    const pixPos = getPixelPosition(clampedX, clampedY);
    onCursorMove({
      imageX: clampedX,
      imageY: clampedY,
      pixelX: pixPos.x,
      pixelY: pixPos.y,
    });
  });

  const setImage = (img) => {
    image = img;
    scale = 1;
    gridRect = null;
    gridDragMode = null;
    hoveredHandle = null;
    hoveredGridBody = false;
    gridMoveStartRect = null;
    cropRect = { x1: 0, y1: 0, x2: img.width, y2: img.height };
    cropDragMode = null;
    hoveredCropHandle = null;
    mosaicEnabled = false;
    mosaicValid = false;
    if (!gridVisible) {
      gridVisible = true;
      onGridVisibilityChange(true);
    }

    const tmp = document.createElement('canvas');
    tmp.width = img.width;
    tmp.height = img.height;
    const tctx = tmp.getContext('2d');
    tctx.drawImage(img, 0, 0);
    try {
      imageData = tctx.getImageData(0, 0, img.width, img.height);
    } catch (_) {
      imageData = null;
    }

    centerImage();
    updateCursor();
    render();
    fireCropChange();
    fireGridChange();
  };

  const zoomAt = (focalX, focalY, factor) => {
    if (!image) return;
    const newScale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, scale * factor));
    if (newScale === scale) return;
    const ratio = newScale / scale;
    offsetX = focalX - (focalX - offsetX) * ratio;
    offsetY = focalY - (focalY - offsetY) * ratio;
    scale = newScale;
    render();
  };

  const zoomCenter = (factor) => {
    zoomAt(canvas.clientWidth / 2, canvas.clientHeight / 2, factor);
  };

  const zoomIn = () => zoomCenter(ZOOM_FACTOR);
  const zoomOut = () => zoomCenter(1 / ZOOM_FACTOR);

  const resetView = () => {
    if (!image) return;
    scale = 1;
    centerImage();
    render();
  };

  const setGridCellsX = (n) => {
    gridCellsX = Math.max(1, Math.floor(n) || 1);
    invalidateMosaic();
    render();
    fireGridChange();
  };

  const setGridCellsY = (n) => {
    gridCellsY = Math.max(1, Math.floor(n) || 1);
    invalidateMosaic();
    render();
    fireGridChange();
  };

  const setCropAmount = (side, value) => {
    if (!image || !cropRect) return;
    normalizeRect(cropRect);
    const n = Math.max(0, Number(value));
    if (!Number.isFinite(n)) return;

    switch (side) {
      case 'top':
        cropRect.y1 = Math.min(n, cropRect.y2 - MIN_CROP_SIZE);
        break;
      case 'bottom':
        cropRect.y2 = Math.max(image.height - n, cropRect.y1 + MIN_CROP_SIZE);
        break;
      case 'left':
        cropRect.x1 = Math.min(n, cropRect.x2 - MIN_CROP_SIZE);
        break;
      case 'right':
        cropRect.x2 = Math.max(image.width - n, cropRect.x1 + MIN_CROP_SIZE);
        break;
      default:
        return;
    }

    normalizeRect(cropRect);
    render();
    fireCropChange();
    fireGridChange();
  };

  const nudgeGridEdge = (edge, amount) => {
    if (!gridRect) return;
    normalizeRect(gridRect);
    const MIN_SIZE = 1;
    switch (edge) {
      case 'leftOut':   gridRect.x1 -= amount; break;
      case 'leftIn':    gridRect.x1 = Math.min(gridRect.x1 + amount, gridRect.x2 - MIN_SIZE); break;
      case 'rightOut':  gridRect.x2 += amount; break;
      case 'rightIn':   gridRect.x2 = Math.max(gridRect.x2 - amount, gridRect.x1 + MIN_SIZE); break;
      case 'topOut':    gridRect.y1 -= amount; break;
      case 'topIn':     gridRect.y1 = Math.min(gridRect.y1 + amount, gridRect.y2 - MIN_SIZE); break;
      case 'bottomOut': gridRect.y2 += amount; break;
      case 'bottomIn':  gridRect.y2 = Math.max(gridRect.y2 - amount, gridRect.y1 + MIN_SIZE); break;
      default: return;
    }
    invalidateMosaic();
    render();
    fireGridChange();
  };

  const setMosaicEnabled = (enabled) => {
    if (enabled && !gridRect) {
      mosaicEnabled = false;
      render();
      return false;
    }
    mosaicEnabled = !!enabled;
    if (mosaicEnabled) invalidateMosaic();
    render();
    return mosaicEnabled;
  };

  const setGridVisible = (visible) => {
    gridVisible = !!visible;
    if (!gridVisible) {
      hoveredHandle = null;
      hoveredGridBody = false;
    }
    updateCursor();
    render();
  };

  const getMosaicEnabled = () => mosaicEnabled;
  const getGridVisible = () => gridVisible;

  const setGridColor = (color) => {
    const rgb = parseHexColor(color);
    if (!rgb) return;
    gridColor = rgb;
    // Update the transform-box border and background colors
    const transformBox = document.querySelector('.transform-box');
    if (transformBox) {
      transformBox.style.borderColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.85)`;
      transformBox.style.backgroundColor = `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0.1)`;
    }
    render();
  };

  const setGridOpacity = (opacity) => {
    const n = Number(opacity);
    if (!Number.isFinite(n)) return;
    gridOpacity = Math.max(0, Math.min(1, n));
    render();
  };

  const clearGrid = () => {
    if (!gridRect) return;
    gridRect = null;
    gridDragMode = null;
    hoveredHandle = null;
    hoveredGridBody = false;
    gridMoveStartRect = null;
    mosaicEnabled = false;
    invalidateMosaic();
    updateCursor();
    render();
    fireGridChange();
  };

  const translateGrid = (dx, dy) => {
    if (!gridRect) return;
    normalizeRect(gridRect);
    gridRect.x1 += dx;
    gridRect.x2 += dx;
    gridRect.y1 += dy;
    gridRect.y2 += dy;
    invalidateMosaic();
    render();
    fireGridChange();
  };

  const exportNativeImage = () => {
    if (!image || !imageData || !gridRect || !cropRect) return null;

    const w = image.width;
    const h = image.height;

    const bx1 = Math.min(gridRect.x1, gridRect.x2);
    const by1 = Math.min(gridRect.y1, gridRect.y2);
    const bx2 = Math.max(gridRect.x1, gridRect.x2);
    const by2 = Math.max(gridRect.y1, gridRect.y2);
    const cellW = (bx2 - bx1) / gridCellsX;
    const cellH = (by2 - by1) / gridCellsY;

    const cx1 = Math.min(cropRect.x1, cropRect.x2);
    const cy1 = Math.min(cropRect.y1, cropRect.y2);
    const cx2 = Math.max(cropRect.x1, cropRect.x2);
    const cy2 = Math.max(cropRect.y1, cropRect.y2);
    const cropW = cx2 - cx1;
    const cropH = cy2 - cy1;

    if (cellW < 0.5 || cellH < 0.5 || cropW < 1 || cropH < 1) return null;

    const nativeW = Math.max(1, Math.round(cropW / cellW));
    const nativeH = Math.max(1, Math.round(cropH / cellH));

    // Pick the first grid-aligned cell whose center falls inside the crop,
    // so the exported pixels match what the mosaic would draw at that spot.
    const firstI = Math.ceil((cx1 - bx1) / cellW - 0.5);
    const firstJ = Math.ceil((cy1 - by1) / cellH - 0.5);

    const outCanvas = document.createElement('canvas');
    outCanvas.width = nativeW;
    outCanvas.height = nativeH;
    const octx = outCanvas.getContext('2d');
    const outData = octx.createImageData(nativeW, nativeH);

    const src32 = new Uint32Array(imageData.data.buffer);
    const dst32 = new Uint32Array(outData.data.buffer);

    for (let py = 0; py < nativeH; py++) {
      const cellJ = firstJ + py;
      const cellCenterY = by1 + (cellJ + 0.5) * cellH;
      let sy = Math.floor(cellCenterY);
      if (sy < 0) sy = 0;
      else if (sy >= h) sy = h - 1;
      const srcRowStart = sy * w;
      const dstRowStart = py * nativeW;

      for (let px = 0; px < nativeW; px++) {
        const cellI = firstI + px;
        const cellCenterX = bx1 + (cellI + 0.5) * cellW;
        let sx = Math.floor(cellCenterX);
        if (sx < 0) sx = 0;
        else if (sx >= w) sx = w - 1;
        dst32[dstRowStart + px] = src32[srcRowStart + sx];
      }
    }

    octx.putImageData(outData, 0, 0);
    return outCanvas;
  };

  canvas.addEventListener('wheel', (e) => {
    if (!image) return;
    e.preventDefault();
    const c = getCanvasCoords(e);
    const factor = e.deltaY < 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
    zoomAt(c.x, c.y, factor);
  }, { passive: false });

  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  canvas.addEventListener('mousedown', (e) => {
    if (!image) return;
    if (panning) return;
    const c = getCanvasCoords(e);

    if (e.button === 1) {
      panning = true;
      panStartX = e.clientX;
      panStartY = e.clientY;
      offsetStartX = offsetX;
      offsetStartY = offsetY;
      updateCursor();
      e.preventDefault();
      return;
    }

    if (e.button === 0) {
      if (spaceHeld) {
        panning = true;
        panStartX = e.clientX;
        panStartY = e.clientY;
        offsetStartX = offsetX;
        offsetStartY = offsetY;
        updateCursor();
        e.preventDefault();
        return;
      }
      // Crop handles take priority over grid handles (crop is drawn on top).
      const cropHandle = getCropHandleAt(c.x, c.y);
      if (cropHandle) {
        cropDragMode = cropHandle;
        updateCursor();
        e.preventDefault();
        return;
      }
      const handle = getHandleAt(c.x, c.y);
      if (handle && gridRect) {
        gridDragMode = handle;
        updateCursor();
        e.preventDefault();
        return;
      }
      if (isPointInGridBody(c.x, c.y)) {
        normalizeRect(gridRect);
        const start = screenToImage(c.x, c.y);
        gridMoveStartX = start.x;
        gridMoveStartY = start.y;
        gridMoveStartRect = { ...gridRect };
        gridDragMode = 'move';
        updateCursor();
        e.preventDefault();
      }
    } else if (e.button === 2) {
      const start = screenToImage(c.x, c.y);
      gridRect = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      gridDragMode = 'create';
      hoveredGridBody = false;
      if (!gridVisible) {
        gridVisible = true;
        onGridVisibilityChange(true);
      }
      invalidateMosaic();
      render();
      e.preventDefault();
    }
  });

  window.addEventListener('mousemove', (e) => {
    if (panning) {
      offsetX = offsetStartX + (e.clientX - panStartX);
      offsetY = offsetStartY + (e.clientY - panStartY);
      render();
      return;
    }
    if (cropDragMode) {
      const c = getCanvasCoords(e);
      applyCropDrag(cropDragMode, screenToImage(c.x, c.y));
      render();
      fireCropChange();
      fireGridChange();
      return;
    }
    if (gridDragMode) {
      const c = getCanvasCoords(e);
      if (gridDragMode === 'move') {
        applyGridMove(screenToImage(c.x, c.y));
      } else {
        applyDragToRect(gridDragMode, screenToImage(c.x, c.y));
      }
      invalidateMosaic();
      render();
      fireGridChange();
      return;
    }
    if (!image) return;
    const c = getCanvasCoords(e);
    const prevCrop = hoveredCropHandle;
    const prevGrid = hoveredHandle;
    const prevGridBody = hoveredGridBody;
    if (spaceHeld) {
      hoveredCropHandle = null;
      hoveredHandle = null;
      hoveredGridBody = false;
    } else {
      hoveredCropHandle = getCropHandleAt(c.x, c.y);
      hoveredHandle = hoveredCropHandle ? null : getHandleAt(c.x, c.y);
      hoveredGridBody = !hoveredCropHandle && !hoveredHandle && isPointInGridBody(c.x, c.y);
    }
    if (prevCrop !== hoveredCropHandle || prevGrid !== hoveredHandle || prevGridBody !== hoveredGridBody) {
      updateCursor();
    }
  });

  window.addEventListener('mouseup', (e) => {
    if (panning && (e.button === 0 || e.button === 1)) {
      panning = false;
      updateCursor();
    }
    if (cropDragMode && e.button === 0) {
      normalizeRect(cropRect);
      cropDragMode = null;
      updateCursor();
      render();
      fireCropChange();
      fireGridChange();
    }
    if (gridDragMode) {
      const endedCreate = gridDragMode === 'create' && e.button === 2;
      const endedResize = gridDragMode !== 'create' && e.button === 0;
      if (endedCreate || endedResize) {
        normalizeRect(gridRect);
        if (gridRect) {
          const w = (gridRect.x2 - gridRect.x1) * scale;
          const h = (gridRect.y2 - gridRect.y1) * scale;
          if (w < 2 || h < 2) gridRect = null;
        }
        if (!gridRect) mosaicEnabled = false;
        gridDragMode = null;
        gridMoveStartRect = null;
        invalidateMosaic();
        updateCursor();
        render();
        fireGridChange();
      }
    }
  });

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Space' && !spaceHeld) {
      spaceHeld = true;
      hoveredHandle = null;
      hoveredGridBody = false;
      hoveredCropHandle = null;
      updateCursor();
      e.preventDefault();
    }
  });

  window.addEventListener('keyup', (e) => {
    if (e.code === 'Space') {
      spaceHeld = false;
      if (panning) {
        panning = false;
      }
      updateCursor();
    }
  });

  window.addEventListener('blur', () => {
    spaceHeld = false;
    panning = false;
    gridDragMode = null;
    gridMoveStartRect = null;
    cropDragMode = null;
    hoveredHandle = null;
    hoveredGridBody = false;
    hoveredCropHandle = null;
    updateCursor();
  });

  window.addEventListener('resize', resize);
  resize();

  return {
    setImage,
    render,
    zoomIn,
    zoomOut,
    resetView,
    setGridCellsX,
    setGridCellsY,
    setCropAmount,
    getCropAmounts,
    getResolutionEstimate,
    setMosaicEnabled,
    setGridVisible,
    getMosaicEnabled,
    getGridVisible,
    nudgeGridEdge,
    exportNativeImage,
    clearGrid,
    translateGrid,
    setGridColor,
    setGridOpacity,
  };
}
