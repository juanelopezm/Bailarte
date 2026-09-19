// Square JPEG thumbnail of a painting, used as the BattleEntrant image in the art battle (plan
// §L) — nothing else in the pipeline produces a small preview image.
function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

export async function makeThumbnail(paintingUrl: string, size = 480): Promise<string> {
  const img = await loadImage(paintingUrl);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const scale = Math.max(size / img.width, size / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (size - dw) / 2, (size - dh) / 2, dw, dh);
  return canvas.toDataURL('image/jpeg', 0.82).split(',')[1] ?? '';
}
