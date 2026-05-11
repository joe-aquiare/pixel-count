export const COMMON_RESOLUTIONS = [
  // 4:3
  { width: 320, height: 240, aspect: '4:3' },
  { width: 640, height: 480, aspect: '4:3' },
  { width: 800, height: 600, aspect: '4:3' },
  { width: 1024, height: 768, aspect: '4:3' },
  { width: 1152, height: 864, aspect: '4:3' },
  { width: 1280, height: 960, aspect: '4:3' },
  { width: 1400, height: 1050, aspect: '4:3' },
  { width: 1600, height: 1200, aspect: '4:3' },
  { width: 2048, height: 1536, aspect: '4:3' },

  // 5:4
  { width: 1280, height: 1024, aspect: '5:4' },

  // 16:9
  { width: 1280, height: 720, aspect: '16:9' },
  { width: 1366, height: 768, aspect: '16:9' },
  { width: 1600, height: 900, aspect: '16:9' },
  { width: 1920, height: 1080, aspect: '16:9' },
  { width: 2560, height: 1440, aspect: '16:9' },
  { width: 3200, height: 1800, aspect: '16:9' },
  { width: 3840, height: 2160, aspect: '16:9' },
  { width: 5120, height: 2880, aspect: '16:9' },
  { width: 7680, height: 4320, aspect: '16:9' },

  // 16:10
  { width: 1280, height: 800, aspect: '16:10' },
  { width: 1440, height: 900, aspect: '16:10' },
  { width: 1680, height: 1050, aspect: '16:10' },
  { width: 1920, height: 1200, aspect: '16:10' },
  { width: 2560, height: 1600, aspect: '16:10' },
  { width: 3840, height: 2400, aspect: '16:10' },

  // 32:9
  { width: 3840, height: 1080, aspect: '32:9' },
  { width: 5120, height: 1440, aspect: '32:9' },
  { width: 7680, height: 2160, aspect: '32:9' },
];

export function findClosestResolution(estimate) {
  if (!estimate) return null;
  let best = null;
  let bestDist = Infinity;
  for (const r of COMMON_RESOLUTIONS) {
    const dw = (estimate.width - r.width) / r.width;
    const dh = (estimate.height - r.height) / r.height;
    const d = dw * dw + dh * dh;
    if (d < bestDist) {
      bestDist = d;
      best = r;
    }
  }
  return best;
}
