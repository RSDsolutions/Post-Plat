import React, { useState, useEffect } from "react";
import { Settings, Save, AlertCircle, FileText, CheckCircle, CreditCard } from "lucide-react";
import { useStore } from "../../store/useStore.js";
import { saveBillingConfig, getBillingConfig, fetchPayments } from "../../lib/supabaseHelpers.js";
import { validateRUC } from "../../lib/invoiceUtils.js";
import { formatDate, daysFrom, buildPaymentSequence } from "../../lib/dates.js";
import { formatUSD } from "../../lib/format.js";
import Badge from "../ui/Badge.jsx";
import AppearanceSettings from "./AppearanceSettings.jsx";

export default function StoreSettings() {
  const { currentUser, showToast, companies, plans } = useStore();
  const company = companies.find(c => c.id === currentUser?.company_id);
  const plan = plans.find(p => p.id === company?.planId);
  const [payments, setPayments] = useState([]);
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

  useEffect(() => {
    if (currentUser?.company_id) {
      fetchPayments(currentUser.company_id).then(setPayments).catch(() => {});
    }
  }, [currentUser?.company_id]);

  const paymentSequence = buildPaymentSequence(payments, company?.subscriptionRenewal);
  const renewalDays = company?.subscriptionRenewal ? daysFrom(company.subscriptionRenewal) : null;

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
        <Settings className="text-panel-accent-soft" size={32} />
        <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-panel-text">Configuración de Tienda</h1>
      </div>

      {/* Subscription status - read only here, payments/plan changes are
          managed by POST-PLAT on the admin side */}
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 space-y-4">
        <div className="flex items-center gap-3 mb-2">
          <CreditCard className="text-panel-success" size={22} />
          <h2 className="text-xl font-bold text-panel-text">Mi Suscripción</h2>
        </div>

        {company?.subscriptionStatus === 'Suspendida' && (
          <div className="bg-panel-danger/10 border border-panel-danger/30 rounded-lg p-4">
            <p className="text-sm font-bold text-panel-danger">Tu cuenta está suspendida. Contacta a POST-PLAT para regularizar el pago y reactivar la facturación.</p>
          </div>
        )}
        {company?.subscriptionStatus === 'Vencida' && (
          <div className="bg-panel-warning/10 border border-panel-warning/30 rounded-lg p-4">
            <p className="text-sm font-bold text-panel-warning">Tu suscripción venció. Regulariza el pago para evitar la suspensión del servicio.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-panel-bg/50 border border-panel-border rounded-xl p-4">
            <div className="text-[10px] text-panel-text-muted uppercase font-bold tracking-widest mb-1">Plan</div>
            <div className="text-lg font-bold text-panel-text">{plan?.name || '—'}</div>
            <div className="text-xs text-panel-text-muted mt-0.5">{formatUSD(company?.customPrice ?? plan?.price)} / {plan?.billingCycle || 'mensual'}</div>
          </div>
          <div className="bg-panel-bg/50 border border-panel-border rounded-xl p-4">
            <div className="text-[10px] text-panel-text-muted uppercase font-bold tracking-widest mb-1">Próxima renovación</div>
            <div className="text-lg font-bold text-panel-text">{company?.subscriptionRenewal ? formatDate(company.subscriptionRenewal) : '—'}</div>
            {renewalDays !== null && <div className="text-xs text-panel-text-muted mt-0.5">{renewalDays >= 0 ? `en ${renewalDays} días` : `vencida hace ${Math.abs(renewalDays)} días`}</div>}
          </div>
          <div className="bg-panel-bg/50 border border-panel-border rounded-xl p-4 flex flex-col justify-center">
            <div className="text-[10px] text-panel-text-muted uppercase font-bold tracking-widest mb-2">Estado</div>
            {company && <Badge status={company.subscriptionStatus} />}
          </div>
        </div>

        <div>
          <h3 className="text-sm font-bold text-panel-text-muted uppercase tracking-wide mb-2 mt-2">Historial de pagos</h3>
          <div className="border border-panel-border rounded-xl overflow-hidden">
            <table className="w-full text-sm text-left">
              <thead className="bg-panel-bg/50 text-panel-text-muted uppercase text-[10px] tracking-widest border-b border-panel-border font-bold">
                <tr>
                  <th className="px-4 py-2.5">#</th>
                  <th className="px-4 py-2.5">Período cubierto</th>
                  <th className="px-4 py-2.5">Monto</th>
                  <th className="px-4 py-2.5">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-panel-border">
                {paymentSequence.length === 0 ? (
                  <tr><td colSpan={4} className="px-4 py-4 text-center text-panel-text-muted">Sin pagos registrados todavía</td></tr>
                ) : paymentSequence.slice().reverse().map(p => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 text-panel-text-muted font-mono">#{p.sequence}</td>
                    <td className="px-4 py-2.5 text-panel-text-muted text-xs">{p.periodEnd ? `${formatDate(p.periodStart)} → ${formatDate(p.periodEnd)}` : '—'}</td>
                    <td className="px-4 py-2.5 font-bold text-panel-text">{formatUSD(p.amount)}</td>
                    <td className="px-4 py-2.5 capitalize text-panel-text-muted">{p.status}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AppearanceSettings />

      {/* Tax Rate Configuration */}
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-6 p-4 bg-panel-accent/10 border border-panel-accent/30 rounded-lg">
          <AlertCircle className="text-panel-accent-soft flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="font-bold text-panel-accent-soft">Configuración de IVA</h3>
            <p className="text-sm text-panel-accent-soft mt-1">
              El IVA configurado aquí se aplicará a todas las ventas en esta tienda
            </p>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-panel-text-muted mb-3">Porcentaje de IVA (%)</label>
          <div className="flex items-center gap-4">
            <input
              type="number"
              min="0"
              max="100"
              step="0.1"
              value={taxRate}
              onChange={(e) => setTaxRate(parseFloat(e.target.value) || 0)}
              className="flex-1 bg-panel-surface-2 border border-panel-border rounded-lg px-4 py-3 text-panel-text text-lg font-bold"
            />
            <span className="text-xl font-bold text-panel-text-muted">%</span>
          </div>
        </div>

        <button
          onClick={handleSaveTaxRate}
          disabled={saving}
          className="w-full bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
        >
          <Save size={20} />
          {saving ? "Guardando..." : "Guardar Configuración de IVA"}
        </button>
      </div>

      {/* Billing Configuration for SRI */}
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 space-y-4">
        <div className="flex items-start gap-3 mb-6 p-4 bg-panel-success/10 border border-panel-success/30 rounded-lg">
          <FileText className="text-panel-success flex-shrink-0 mt-1" size={20} />
          <div>
            <h3 className="font-bold text-panel-success">Configuración de Facturación (SRI)</h3>
            <p className="text-sm text-panel-success mt-1">
              Información requerida para generar facturas electrónicas válidas ante el SRI
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">RUC (13 dígitos)</label>
            <input
              type="text"
              maxLength="13"
              placeholder="1234567890001"
              value={billingConfig.ruc}
              onChange={(e) => setBillingConfig({...billingConfig, ruc: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Razón Social</label>
            <input
              type="text"
              placeholder="Mi Empresa S.A."
              value={billingConfig.razonSocial}
              onChange={(e) => setBillingConfig({...billingConfig, razonSocial: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
            />
          </div>
        </div>

        <div>
          <label className="block text-xs font-bold text-panel-text-muted mb-2">Nombre Comercial</label>
          <input
            type="text"
            placeholder="Mi Tienda"
            value={billingConfig.nombreComercial}
            onChange={(e) => setBillingConfig({...billingConfig, nombreComercial: e.target.value})}
            className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
          />
        </div>

        <div>
          <label className="block text-xs font-bold text-panel-text-muted mb-2">Dirección</label>
          <input
            type="text"
            placeholder="Calle Principal 123"
            value={billingConfig.address}
            onChange={(e) => setBillingConfig({...billingConfig, address: e.target.value})}
            className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Establecimiento</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={billingConfig.establishment}
              onChange={(e) => setBillingConfig({...billingConfig, establishment: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted font-mono"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Punto de Venta</label>
            <input
              type="text"
              maxLength="3"
              placeholder="001"
              value={billingConfig.pointOfSale}
              onChange={(e) => setBillingConfig({...billingConfig, pointOfSale: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted font-mono"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Email</label>
            <input
              type="email"
              placeholder="info@empresa.com"
              value={billingConfig.email}
              onChange={(e) => setBillingConfig({...billingConfig, email: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Teléfono</label>
            <input
              type="tel"
              placeholder="+593 2 1234567"
              value={billingConfig.phone}
              onChange={(e) => setBillingConfig({...billingConfig, phone: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text placeholder-panel-text-muted"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-bold text-panel-text-muted mb-2">Ambiente</label>
            <select
              value={billingConfig.environment}
              onChange={(e) => setBillingConfig({...billingConfig, environment: e.target.value})}
              className="w-full bg-panel-surface-2 border border-panel-border rounded px-3 py-2 text-panel-text"
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
              <span className="text-xs font-bold text-panel-text-muted">Lleva Contabilidad</span>
            </label>
          </div>
        </div>

        <button
          onClick={handleSaveBillingConfig}
          disabled={saving}
          className="w-full bg-emerald-700 hover:bg-emerald-800 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 rounded-lg transition-colors flex items-center justify-center gap-2 mt-6"
        >
          <CheckCircle size={20} />
          {saving ? "Guardando..." : "Guardar Configuración de Facturación"}
        </button>
      </div>

      {/* Store Info */}
      <div className="bg-panel-surface border border-panel-border rounded-2xl p-6 space-y-4">
        <h2 className="text-xl font-bold text-panel-text">Información de Tienda</h2>

        <div>
          <label className="block text-sm font-bold text-panel-text-muted mb-2">Nombre de Tienda</label>
          <input
            type="text"
            value={currentUser?.name || ""}
            disabled
            className="w-full bg-panel-surface-2 border border-panel-border rounded-lg px-4 py-2 text-panel-text-muted cursor-not-allowed"
          />
        </div>

        <div>
          <label className="block text-sm font-bold text-panel-text-muted mb-2">ID de Tienda</label>
          <input
            type="text"
            value={currentUser?.company_id || ""}
            disabled
            className="w-full bg-panel-surface-2 border border-panel-border rounded-lg px-4 py-2 text-panel-text-muted cursor-not-allowed font-mono text-sm"
          />
        </div>
      </div>
    </div>
  );
}
