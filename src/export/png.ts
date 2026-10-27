// PNG export: the standalone SVG drawn on a canvas at 96 dpi times the scale.
export const PX_PER_MM = 96 / 25.4;

export async function svgToPng(svg: string, widthMm: number, heightMm: number, scale: 2 | 4): Promise<Blob> {
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(widthMm * PX_PER_MM * scale);
    canvas.height = Math.round(heightMm * PX_PER_MM * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('no 2D canvas');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encode failed'))), 'image/png'),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}
