const MIN_SCALE = 0.2;
const MAX_SCALE = 5.0;
const ZOOM_FACTOR = 1.25;
const HANDLE_HIT_PX = 8;
const HANDLE_DRAW_PX = 7;

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

export function createViewport(canvas, {
  onGridChange = () => {},
  onGridVisibilityChange = () => {},
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

  // Grid coords are stored in image space so the box stays anchored to the
  // image through subsequent pan and zoom. The rect is kept normalized
  // (x1 <= x2, y1 <= y2) except transiently during a drag.
  let gridRect = null;
  let gridDragMode = null;
  let hoveredHandle = null;
  let gridCells = 8;
  let gridVisible = true;

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

  const normalizeGridRect = () => {
    if (!gridRect) return;
    if (gridRect.x1 > gridRect.x2) [gridRect.x1, gridRect.x2] = [gridRect.x2, gridRect.x1];
    if (gridRect.y1 > gridRect.y2) [gridRect.y1, gridRect.y2] = [gridRect.y2, gridRect.y1];
  };

  const getHandleAt = (sx, sy) => {
    if (!gridRect || !gridVisible) return null;
    const a = imageToScreen(Math.min(gridRect.x1, gridRect.x2), Math.min(gridRect.y1, gridRect.y2));
    const b = imageToScreen(Math.max(gridRect.x1, gridRect.x2), Math.max(gridRect.y1, gridRect.y2));

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

  const updateCursor = () => {
    if (panning) {
      canvas.style.cursor = 'grabbing';
    } else if (spaceHeld && image) {
      canvas.style.cursor = 'grab';
    } else if (gridDragMode && gridDragMode !== 'create') {
      canvas.style.cursor = CURSOR_FOR_HANDLE[gridDragMode] || '';
    } else if (hoveredHandle) {
      canvas.style.cursor = CURSOR_FOR_HANDLE[hoveredHandle];
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

    const cellW = w / gridCells;
    const cellH = h / gridCells;

    // Light grid extending from the box edges to the image bounds. Skipped
    // when cells are too small to read, to avoid a wall of lines.
    if (image && cellW >= 3 && cellH >= 3) {
      const imgA = imageToScreen(0, 0);
      const imgB = imageToScreen(image.width, image.height);
      const imgW = imgB.x - imgA.x;
      const imgH = imgB.y - imgA.y;

      ctx.save();
      ctx.beginPath();
      ctx.rect(imgA.x, imgA.y, imgW, imgH);
      ctx.rect(a.x, a.y, w, h);
      ctx.clip('evenodd');

      ctx.lineWidth = 1;
      ctx.strokeStyle = 'rgba(120, 210, 255, 0.22)';
      ctx.beginPath();

      const iMin = Math.ceil((imgA.x - a.x) / cellW);
      const iMax = Math.floor((imgB.x - a.x) / cellW);
      for (let i = iMin; i <= iMax; i++) {
        const x = a.x + i * cellW;
        ctx.moveTo(x, imgA.y);
        ctx.lineTo(x, imgB.y);
      }

      const jMin = Math.ceil((imgA.y - a.y) / cellH);
      const jMax = Math.floor((imgB.y - a.y) / cellH);
      for (let j = jMin; j <= jMax; j++) {
        const y = a.y + j * cellH;
        ctx.moveTo(imgA.x, y);
        ctx.lineTo(imgB.x, y);
      }

      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(80, 180, 255, 0.12)';
    ctx.fillRect(a.x, a.y, w, h);

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.6)';
    ctx.beginPath();
    for (let i = 1; i < gridCells; i++) {
      const tx = a.x + cellW * i;
      const ty = a.y + cellH * i;
      ctx.moveTo(tx, a.y);
      ctx.lineTo(tx, a.y + h);
      ctx.moveTo(a.x, ty);
      ctx.lineTo(a.x + w, ty);
    }
    ctx.stroke();

    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(120, 210, 255, 0.95)';
    ctx.strokeRect(a.x, a.y, w, h);

    const half = HANDLE_DRAW_PX / 2;
    const handles = [
      [a.x, a.y], [b.x, a.y], [a.x, b.y], [b.x, b.y],
      [(a.x + b.x) / 2, a.y], [(a.x + b.x) / 2, b.y],
      [a.x, (a.y + b.y) / 2], [b.x, (a.y + b.y) / 2],
    ];
    ctx.fillStyle = 'rgba(120, 210, 255, 1)';
    ctx.strokeStyle = '#1e1e1e';
    ctx.lineWidth = 1;
    for (const [px, py] of handles) {
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
    dctx.clearRect(0, 0, w, h);

    const bx1 = Math.min(gridRect.x1, gridRect.x2);
    const by1 = Math.min(gridRect.y1, gridRect.y2);
    const bx2 = Math.max(gridRect.x1, gridRect.x2);
    const by2 = Math.max(gridRect.y1, gridRect.y2);
    const cellW = (bx2 - bx1) / gridCells;
    const cellH = (by2 - by1) / gridCells;

    // If cells would be sub-pixel, mosaic is meaningless — fall back to original.
    if (cellW < 0.5 || cellH < 0.5) {
      dctx.drawImage(image, 0, 0);
      mosaicValid = true;
      return;
    }

    const iMin = Math.floor(-bx1 / cellW);
    const iMax = Math.floor((w - bx1) / cellW);
    const jMin = Math.floor(-by1 / cellH);
    const jMax = Math.floor((h - by1) / cellH);
    const data = imageData.data;

    for (let j = jMin; j <= jMax; j++) {
      const top = by1 + j * cellH;
      const bottom = top + cellH;
      const sy = Math.max(0, Math.min(h - 1, Math.floor(top + cellH / 2)));
      const yClip = Math.max(0, top);
      const bottomClip = Math.min(h, bottom);
      if (bottomClip <= yClip) continue;

      for (let i = iMin; i <= iMax; i++) {
        const left = bx1 + i * cellW;
        const right = left + cellW;
        const sx = Math.max(0, Math.min(w - 1, Math.floor(left + cellW / 2)));
        const xClip = Math.max(0, left);
        const rightClip = Math.min(w, right);
        if (rightClip <= xClip) continue;

        const idx = (sy * w + sx) * 4;
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3] / 255;
        dctx.fillStyle = `rgba(${r},${g},${b},${a})`;
        dctx.fillRect(xClip, yClip, rightClip - xClip, bottomClip - yClip);
      }
    }
    mosaicValid = true;
  };

  const invalidateMosaic = () => {
    mosaicValid = false;
  };

  const render = () => {
    const r = dpr();
    ctx.setTransform(r, 0, 0, r, 0, 0);
    ctx.clearRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    if (mosaicEnabled && image && gridRect) {
      if (!mosaicValid) computeMosaic();
      if (mosaicCanvas) {
        ctx.drawImage(mosaicCanvas, offsetX, offsetY, image.width * scale, image.height * scale);
      }
    } else if (image) {
      ctx.drawImage(image, offsetX, offsetY, image.width * scale, image.height * scale);
    }
    drawGrid();
  };

  const centerImage = () => {
    if (!image) return;
    offsetX = (canvas.clientWidth - image.width * scale) / 2;
    offsetY = (canvas.clientHeight - image.height * scale) / 2;
  };

  const getResolutionEstimate = () => {
    if (!image || !gridRect) return null;
    const gw = Math.abs(gridRect.x2 - gridRect.x1);
    const gh = Math.abs(gridRect.y2 - gridRect.y1);
    if (gw < 1 || gh < 1) return null;
    return {
      width: Math.round((image.width * gridCells) / gw),
      height: Math.round((image.height * gridCells) / gh),
    };
  };

  const fireGridChange = () => onGridChange(getResolutionEstimate());

  const setImage = (img) => {
    image = img;
    scale = 1;
    gridRect = null;
    gridDragMode = null;
    hoveredHandle = null;
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

  const setGridCells = (n) => {
    gridCells = Math.max(1, Math.floor(n) || 1);
    invalidateMosaic();
    render();
    fireGridChange();
  };

  const nudgeGridEdge = (edge, amount) => {
    if (!gridRect) return;
    normalizeGridRect();
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
    if (!gridVisible) hoveredHandle = null;
    updateCursor();
    render();
  };

  const getMosaicEnabled = () => mosaicEnabled;
  const getGridVisible = () => gridVisible;

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
    const c = getCanvasCoords(e);

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
      const handle = getHandleAt(c.x, c.y);
      if (handle && gridRect) {
        gridDragMode = handle;
        updateCursor();
        e.preventDefault();
      }
    } else if (e.button === 2) {
      const start = screenToImage(c.x, c.y);
      gridRect = { x1: start.x, y1: start.y, x2: start.x, y2: start.y };
      gridDragMode = 'create';
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
    if (gridDragMode) {
      const c = getCanvasCoords(e);
      applyDragToRect(gridDragMode, screenToImage(c.x, c.y));
      invalidateMosaic();
      render();
      fireGridChange();
      return;
    }
    if (!image) return;
    const c = getCanvasCoords(e);
    const prev = hoveredHandle;
    hoveredHandle = spaceHeld ? null : getHandleAt(c.x, c.y);
    if (prev !== hoveredHandle) updateCursor();
  });

  window.addEventListener('mouseup', (e) => {
    if (panning && e.button === 0) {
      panning = false;
      updateCursor();
    }
    if (gridDragMode) {
      const endedCreate = gridDragMode === 'create' && e.button === 2;
      const endedResize = gridDragMode !== 'create' && e.button === 0;
      if (endedCreate || endedResize) {
        normalizeGridRect();
        // Discard zero / near-zero rects from a stray click without drag.
        if (gridRect) {
          const w = (gridRect.x2 - gridRect.x1) * scale;
          const h = (gridRect.y2 - gridRect.y1) * scale;
          if (w < 2 || h < 2) gridRect = null;
        }
        if (!gridRect) mosaicEnabled = false;
        gridDragMode = null;
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
    hoveredHandle = null;
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
    setGridCells,
    getResolutionEstimate,
    setMosaicEnabled,
    setGridVisible,
    getMosaicEnabled,
    getGridVisible,
    nudgeGridEdge,
  };
}
