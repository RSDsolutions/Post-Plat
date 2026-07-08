// Loads a remote image (e.g. a company logo stored in Supabase Storage) and
// rasterizes it to a PNG data URL so jsPDF's addImage() can embed it
// regardless of the original format (webp/svg/etc). Resolves to null instead
// of throwing so callers can fall back to a text-only header when there is
// no logo or it fails to load (e.g. offline, CORS).
export function loadImageAsDataUrl(url) {
  return new Promise((resolve) => {
    if (!url) {
      resolve(null);
      return;
    }
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0);
        resolve({
          dataUrl: canvas.toDataURL('image/png'),
          width: img.naturalWidth,
          height: img.naturalHeight
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}
