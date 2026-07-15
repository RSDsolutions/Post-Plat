import React from 'react';

// Mockup en miniatura renderizado con los colores REALES del catálogo
// (src/lib/themes.js), no una imagen estática. Compartido por el paso
// "Diseño del POS" del wizard y AppearanceSettings.jsx para que la manera
// de previsualizar un tema viva en un solo lugar.
export default function ThemeMiniPreview({ preview }) {
  return (
    <div className="rounded-lg overflow-hidden border" style={{ backgroundColor: preview.bg, borderColor: preview.border }}>
      <div className="h-2.5" style={{ backgroundColor: preview.surface }} />
      <div className="p-2.5 space-y-1.5">
        <div className="h-2 w-3/4 rounded-sm" style={{ backgroundColor: preview.text, opacity: 0.85 }} />
        <div className="h-2 w-1/2 rounded-sm" style={{ backgroundColor: preview.text, opacity: 0.35 }} />
      </div>
    </div>
  );
}
