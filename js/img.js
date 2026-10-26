// 사진 줄이기·돌리기 (저장 공간을 아끼고, 옆으로 누운 안내도 사진을 바로 세운다)

async function decode(blob) {
  try { return await createImageBitmap(blob, { imageOrientation: 'from-image' }); }
  catch {
    const url = URL.createObjectURL(blob);
    try {
      const im = new Image();
      im.src = url;
      await im.decode();
      return im;
    } finally { URL.revokeObjectURL(url); }
  }
}

const toBlob = (c, q = 0.85) => new Promise(r => c.toBlob(r, 'image/jpeg', q));

// 긴 쪽이 max 픽셀이 되도록 줄인다
export async function shrink(file, max = 2000) {
  const bm = await decode(file);
  const w0 = bm.width, h0 = bm.height;
  const k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas');
  c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bm, 0, 0, c.width, c.height);
  bm.close?.();
  return toBlob(c);
}

// 시계 방향으로 90도
export async function rotate(blob) {
  const bm = await decode(blob);
  const c = document.createElement('canvas');
  c.width = bm.height; c.height = bm.width;
  const g = c.getContext('2d');
  g.translate(c.width, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(bm, 0, 0);
  bm.close?.();
  return toBlob(c, 0.9);
}
