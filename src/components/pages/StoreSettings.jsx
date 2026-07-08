import React, { useState, useEffect } from "react";
import { Settings, Save, AlertCircle, FileText, CheckCircle } from "lucide-react";
import { useStore } from "../../store/useStore.js";
import { saveBillingConfig, getBillingConfig } from "../../lib/supabaseHelpers.js";
import { validateRUC } from "../../lib/invoiceUtils.js";

export default function StoreSettings() {
  const { currentUser, showToast } = useStore();
  const [taxRate, setTaxRate] = useState(12);
  const [saving, setSaving] = useState(false);
  const [billingConfig, setBillingConfig] = useState({
    ruc: "",
    razonSocial: "",
    nombreComercial: "",
    establishment: "001",
    pointOfSale: "001",
    address: "",
    email: "",
    phone: "",
    llevaContabilidad: false,
    environment: "production",
    initialSequential: 1
  });

  useEffect(() => {
    const loadConfig = async () => {
      try {
        const savedTaxRate = localStorage.getItem(`store_tax_${currentUser?.company_id}`);
        if (savedTaxRate) {
          setTaxRate(parseFloat(savedTaxRate));
        }

        const config = await getBillingConfig(currentUser?.company_id);
        if (config) {
          setBillingConfig(config);
        }
      } catch (error) {
        console.error("Error loading config:", error);
      }
    };

    if (currentUser?.company_id) {
      loadConfig();
    }
  }, [currentUser]);

  const handleSaveTaxRate = async () => {
    setSaving(true);
    try {
      if (taxRate < 0 || taxRate > 100) {
        showToast("error", "El IVA debe estar entre 0 y 100");
        return;
      }

      localStorage.setItem(`store_tax_${currentUser?.company_id}`, taxRate.toString());
      showToast("success", `IVA actualizado a ${taxRate}%`);
    } catch (error) {
      console.error("Error saving tax rate:", error);
      showToast("error", "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  const handleSaveBillingConfig = async () => {
    setSaving(true);
    try {
      if (!billingConfig.ruc) {
        showToast("error", "RUC requerido");
        return;
      }

      if (!validateRUC(billingConfig.ruc)) {
        showToast("error", "RUC inválido (verificar dígito verificador)");
        return;
      }

      if (!billingConfig.razonSocial || !billingConfig.nombreComercial) {
        showToast("error", "Razón social y nombre comercial son requeridos");
        return;
      }

      await saveBillingConfig(currentUser?.company_id, billingConfig);
      showToast("success", "Configuración de facturación guardada");
    } catch (error) {
      console.error("Error saving billing config:", error);
      showToast("error", "Error al guardar configuración");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 mb-8">
        <Settings className="text-blue-500" size={32} />
        <h1 className="text-4xl font-bold text-zinc-100">Configuración de Tienda</h1>
      </div>

      {/* Tax Rate Configuration */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-6 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg">
          <AlertCircle className="text-blue-500 flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="font-bold text-blue-400">Configuración de IVA</h3>
            <p className="text-sm text-blue-300 mt-1">
              El IVA configurado aquí se aplicará a todas las ventas en esta tienda
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-3">Porcentaje de IVA (%)</label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-3 text-white text-lg font-bold"
            />
            <span className="text-xl font-bold text-zinc-400">%</span>
          </div>
        </div>

        <button
          onClick={handleSaveTaxRate}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar Configuración de IVA"}
        </button>
      </div>

      {/* Billing Configuration for SRI */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-6 p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-lg">
          <FileText className="text-emerald-500 flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="font-bold text-emerald-400">Configuración de Facturación (SRI)</h3>
            <p className="text-sm text-emerald-300 mt-1">
              Información requerida para generar facturas electrónicas válidas ante el SRI
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">RUC (13 dígitos)</label>
            <input
              type="text"
              maxLength="13"
              placeholder="1234567890001"
              value={billingConfig.ruc}
              onChange={(e) => setBillingConfig({...billingConfig, ruc: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Razón Social</label>
            <input
              type="text"
              placeholder="Mi Empresa S.A."
              value={billingConfig.razonSocial}
              onChange={(e) => setBillingConfig({...billingConfig, razonSocial: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Nombre Comercial</label>
          <input
            type="text"
            placeholder="Mi Tienda"
            value={billingConfig.nombreComercial}
            onChange={(e) => setBillingConfig({...billingConfig, nombreComercial: e.target.value})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-zinc-400 mb-2">Dirección</label>
          <input
            type="text"
            placeholder="Calle Principal 123"
            value={billingConfig.address}
            onChange={(e) => setBillingConfig({...billingConfig, address: e.target.value})}
            className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Establecimiento</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={billingConfig.establishment}
              onChange={(e) => setBillingConfig({...billingConfig, establishment: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Punto de Venta</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={billingConfig.pointOfSale}
              onChange={(e) => setBillingConfig({...billingConfig, pointOfSale: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500 font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Email</label>
            <input
              type="email"
              placeholder="info@empresa.com"
              value={billingConfig.email}
              onChange={(e) => setBillingConfig({...billingConfig, email: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Teléfono</label>
            <input
              type="tel"
              placeholder="+593 2 1234567"
              value={billingConfig.phone}
              onChange={(e) => setBillingConfig({...billingConfig, phone: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white placeholder-zinc-500"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-zinc-400 mb-2">Ambiente</label>
            <select
              value={billingConfig.environment}
              onChange={(e) => setBillingConfig({...billingConfig, environment: e.target.value})}
              className="w-full bg-zinc-800 border border-zinc-700 rounded px-3 py-2 text-white"
            >
              <option value="production">Producción (Real)</option>
              <option value="test">Pruebas (Test)</option>
            </select>
          </div>
          <div className="flex items-end">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={billingConfig.llevaContabilidad}
                onChange={(e) => setBillingConfig({...billingConfig, llevaContabilidad: e.target.checked})}
                className="w-4 h-4 rounded"
              />
              <span className="text-xs font-bold text-zinc-300">Lleva Contabilidad</span>
            </label>
          </div>
        </div>

        <button
          onClick={handleSaveBillingConfig}
          disabled={saving}
          className="w-full bg-emerald-600 hover:bg-emerald-700 disabled:bg-zinc-700 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
        >
          <CheckCircle size={20} />
          {saving ? "Guardando..." : "Guardar Configuración de Facturación"}
        </button>
      </div>

      {/* Store Info */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-zinc-100">Información de Tienda</h2>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-2">Nombre de Tienda</label>
          <input
            type="text"
            value={currentUser?.name || ""}
            disabled
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-400 cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-zinc-300 mb-2">ID de Tienda</label>
          <input
            type="text"
            value={currentUser?.company_id || ""}
            disabled
            className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-4 py-2 text-zinc-400 cursor-not-allowed font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
