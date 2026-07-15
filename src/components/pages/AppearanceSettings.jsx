import React, { useState, useEffect } from 'react';
import { Palette, Check, Lock, Save, Store } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchCompanyUiSettings, fetchCompanyFeatureOverrides, updateCompanyUiSettings } from '../../lib/supabaseHelpers.js';
import { hasFeature } from '../../lib/planLimits.js';
import { POS_THEMES, POS_ACCENTS, DEFAULT_UI_SETTINGS, getSafeUiSettings } from '../../lib/themes.js';
import ThemeMiniPreview from '../ui/ThemeMiniPreview.jsx';
import EmptyState from '../ui/EmptyState.jsx';

const PREVIEW_PRODUCTS = [
  { name: 'Producto A', price: '$4.50' },
  { name: 'Producto B', price: '$12.00' }
];

export default function AppearanceSettings() {
  const { currentUser, showToast, companies, plans } = useStore();
  const company = companies.find(c => c.id === currentUser?.company_id);
  const plan = plans.find(p => p.id === company?.planId);

  const [loading, setLoading] = useState(true);
  const [featureOverrides, setFeatureOverrides] = useState([]);
  const [saved, setSaved] = useState(DEFAULT_UI_SETTINGS);
  const [draft, setDraft] = useState(DEFAULT_UI_SETTINGS);
  const [saving, setSaving] = useState(false);

  const themingEnabled = hasFeature(plan, featureOverrides, 'pos_theming');

  useEffect(() => {
    const load = async () => {
      if (!currentUser?.company_id) return;
      setLoading(true);
      try {
        const [rawSettings, overrides] = await Promise.all([
          fetchCompanyUiSettings(currentUser.company_id),
          fetchCompanyFeatureOverrides(currentUser.company_id)
        ]);
        const safe = getSafeUiSettings(rawSettings);
        setSaved(safe);
        setDraft(safe);
        setFeatureOverrides(overrides);
      } catch (error) {
        console.error('Error loading appearance settings:', error);
        showToast('error', 'Error al cargar la apariencia del POS');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [currentUser?.company_id, showToast]);

  const hasChanges = draft.pos_theme !== saved.pos_theme || draft.pos_accent !== saved.pos_accent;

  const handleSave = async () => {
    setSaving(true);
    try {
      await updateCompanyUiSettings(currentUser.company_id, draft.pos_theme, draft.pos_accent);
      setSaved(draft);
      showToast('success', 'Apariencia del POS actualizada');
    } catch (error) {
      console.error('Error saving appearance settings:', error);
      showToast('error', error.message || 'Error al guardar la apariencia');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6">
        <div className="h-32 flex items-center justify-center text-panel-text-muted text-sm">Cargando apariencia...</div>
      </div>
    );
  }

  if (!themingEnabled) {
    return (
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <Palette className="text-[var(--kpi-purple)]" size={22} />
          <h2 className="text-xl font-bold text-panel-text">Apariencia del POS</h2>
        </div>
        <EmptyState
          icon={Lock}
          title="No incluido en tu plan"
          description="Actualiza tu plan para elegir el tema y la paleta de color del punto de venta. Por ahora tu POS usa el diseño por defecto."
        />
      </div>
    );
  }

  return (
    <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Palette className="text-[var(--kpi-purple)]" size={22} />
        <h2 className="text-xl font-bold text-panel-text">Apariencia del POS</h2>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6">
        <div className="space-y-6 min-w-0">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted uppercase tracking-wide mb-3">Tema</label>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {POS_THEMES.map(theme => {
                const isSelected = draft.pos_theme === theme.id;
                return (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, pos_theme: theme.id }))}
                    className={`text-left rounded-xl border p-3 transition-colors ${
                      isSelected ? 'border-blue-500 bg-blue-500/10 ring-1 ring-blue-500' : 'border-panel-border bg-panel-bg/50 hover:border-panel-text-muted'
                    }`}
                  >
                    <ThemeMiniPreview preview={theme.preview} />
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-sm font-bold text-panel-text">{theme.name}</span>
                      {isSelected && <Check size={14} className="text-panel-accent-soft" />}
                    </div>
                    <p className="text-[11px] text-panel-text-muted mt-0.5">{theme.description}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-panel-text-muted uppercase tracking-wide mb-3">Paleta de acento</label>
            <div className="flex flex-wrap gap-3">
              {POS_ACCENTS.map(accent => {
                const isSelected = draft.pos_accent === accent.id;
                return (
                  <button
                    key={accent.id}
                    type="button"
                    onClick={() => setDraft(d => ({ ...d, pos_accent: accent.id }))}
                    title={accent.name}
                    className={`w-10 h-10 rounded-full border-2 flex items-center justify-center transition-all ${
                      isSelected ? 'border-panel-text scale-110' : 'border-transparent'
                    }`}
                    style={{ backgroundColor: accent.preview }}
                  >
                    {isSelected && <Check size={16} className="text-white drop-shadow" />}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Preview en vivo con el tema/paleta seleccionados-pero-no-guardados -
            data-pos-theme/data-pos-accent resuelven las mismas variables --pos-*
            que usa el POS real (src/styles/themes.css), así que esto no
            duplica ninguna lógica de color: es exactamente el mismo mecanismo,
            solo que aplicado a un mockup chico en vez de a POSLayout. Este
            recuadro se queda en tokens pos-* a propósito (no panel-*) - está
            simulando el POS, no el panel. */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <label className="block text-xs font-bold text-panel-text-muted uppercase tracking-wide mb-3">Vista previa</label>
          <div
            data-pos-theme={draft.pos_theme}
            data-pos-accent={draft.pos_accent}
            className="rounded-2xl overflow-hidden border border-pos-border shadow-lg"
          >
            <div className="bg-pos-surface border-b border-pos-border px-3 py-2.5 flex items-center gap-2">
              <div className="w-6 h-6 rounded bg-pos-accent/15 border border-pos-accent/30 flex items-center justify-center flex-shrink-0">
                <Store size={12} className="text-pos-accent-soft" />
              </div>
              <span className="text-xs font-bold text-pos-text truncate">Punto de Venta</span>
            </div>
            <div className="bg-pos-bg p-3 space-y-2">
              {PREVIEW_PRODUCTS.map(p => (
                <div key={p.name} className="pos-card bg-pos-surface border border-pos-border rounded-lg px-3 py-2 flex items-center justify-between text-xs">
                  <span className="text-pos-text font-bold truncate">{p.name}</span>
                  <span className="text-pos-success font-bold flex-shrink-0 ml-2">{p.price}</span>
                </div>
              ))}
              <button type="button" tabIndex={-1} className="pos-btn-primary w-full bg-pos-accent text-pos-accent-text font-bold text-sm py-2.5 rounded-lg mt-1 cursor-default">
                Cobrar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-4 pt-4 border-t border-panel-border">
        <p className="text-[11px] text-panel-text-muted max-w-md">
          Las cajas con sesión de POS ya abierta toman el nuevo diseño recién en su próximo inicio de sesión.
        </p>
        <button
          onClick={handleSave}
          disabled={!hasChanges || saving}
          className="flex-shrink-0 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold px-5 py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Save size={16} />
          {saving ? 'Guardando...' : 'Guardar apariencia'}
        </button>
      </div>
    </div>
  );
}
