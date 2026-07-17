import React, { useState, useEffect } from 'react';
import { DollarSign, Calendar, CheckCircle2, AlertTriangle, Plus, Loader } from 'lucide-react';
import { useStore } from '../../store/useStore.js';
import { fetchAllPayments } from '../../lib/supabaseHelpers.js';
import { formatUSD } from '../../lib/format.js';
import { formatDate, daysFrom } from '../../lib/dates.js';
import MetricCard from '../ui/MetricCard.jsx';
import Badge from '../ui/Badge.jsx';
import Table from '../ui/Table.jsx';
import EmptyState from '../ui/EmptyState.jsx';
import PaymentModal from '../ui/PaymentModal.jsx';

export default function Payments() {
  const { companies, plans, currentUser } = useStore();
  // Mejoras Admin Fase 8: registrar un pago es una mutación reservada a
  // super (payments_insert ahora exige is_platform_super_admin()).
  const isSuperAdmin = currentUser?.admin_level === 'super';
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modalCompany, setModalCompany] = useState(undefined); // undefined = closed, null = open w/ picker, company = open locked

  const loadPayments = () => {
    setLoading(true);
    fetchAllPayments()
      .then(setPayments)
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadPayments(); }, []);

  const now = new Date();
  const totalCollected = payments.reduce((sum, p) => sum + Number(p.amount), 0);
  const thisMonthCollected = payments
    .filter(p => {
      const d = new Date(p.payment_date);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    })
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const upToDateCount = companies.filter(c => c.subscriptionStatus === 'Activa').length;
  const pendingCount = companies.filter(c => ['Vencida', 'Por vencer', 'Suspendida'].includes(c.subscriptionStatus)).length;

  const lastPaymentByCompany = payments.reduce((acc, p) => {
    if (!acc[p.company_id] || new Date(p.payment_date) > new Date(acc[p.company_id])) acc[p.company_id] = p.payment_date;
    return acc;
  }, {});

  const sortedCompanies = [...companies].sort((a, b) => {
    const da = a.subscriptionRenewal ? a.subscriptionRenewal.getTime() : Infinity;
    const db = b.subscriptionRenewal ? b.subscriptionRenewal.getTime() : Infinity;
    return da - db;
  });

  const closeModal = () => {
    setModalCompany(undefined);
    loadPayments();
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <h1 className="text-4xl font-bold tracking-tighter uppercase text-[var(--text-primary)]">Pagos</h1>
        {isSuperAdmin && (
        <button
          onClick={() => setModalCompany(null)}
          className="bg-[var(--brand)] hover:bg-[var(--brand-dark)] text-zinc-950 font-bold px-6 py-3 rounded-2xl text-sm flex items-center shrink-0 w-fit transition-colors"
        >
          <Plus size={18} className="mr-2" /> Registrar pago
        </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <MetricCard icon={DollarSign} label="Recaudado histórico" value={formatUSD(totalCollected)} color="green" />
        <MetricCard icon={Calendar} label="Recaudado este mes" value={formatUSD(thisMonthCollected)} color="brand" />
        <MetricCard icon={CheckCircle2} label="Empresas al día" value={upToDateCount} color="green" />
        <MetricCard icon={AlertTriangle} label="Con pago pendiente" value={pendingCount} color="red" />
      </div>

      <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--surface-0)]/30">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Estado de cobro por empresa</h2>
        </div>
        <Table
          columns={['Empresa', 'Plan', 'Estado', 'Vence', 'Último pago', 'Acción']}
          data={sortedCompanies}
          renderRow={(company) => {
            const plan = plans.find(p => p.id === company.planId);
            const days = company.subscriptionRenewal ? daysFrom(company.subscriptionRenewal) : null;
            const lastPayment = lastPaymentByCompany[company.id];
            return (
              <tr key={company.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{company.nombreComercial}</td>
                <td className="px-4 py-3 text-zinc-400">{plan?.name || '—'}</td>
                <td className="px-4 py-3"><Badge status={company.subscriptionStatus} /></td>
                <td className="px-4 py-3 text-zinc-400">
                  {company.subscriptionRenewal ? formatDate(company.subscriptionRenewal) : '—'}
                  {days !== null && <span className={`ml-1 text-xs ${days < 0 ? 'text-red-400' : days <= 5 ? 'text-amber-400' : 'text-zinc-600'}`}>({days >= 0 ? `${days}d` : `-${Math.abs(days)}d`})</span>}
                </td>
                <td className="px-4 py-3 text-zinc-500 text-xs">{lastPayment ? formatDate(new Date(lastPayment)) : 'Sin pagos'}</td>
                <td className="px-4 py-3">
                  <button
                    onClick={() => setModalCompany(company)}
                    disabled={!isSuperAdmin}
                    title={isSuperAdmin ? '' : 'Solo un administrador super puede registrar pagos'}
                    className="text-xs font-bold uppercase tracking-wider text-[var(--brand)] hover:text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Registrar pago
                  </button>
                </td>
              </tr>
            );
          }}
        />
      </div>

      <div className="bg-[var(--surface-1)] rounded-3xl border border-[var(--border-subtle)] overflow-hidden">
        <div className="px-6 py-5 border-b border-[var(--border-subtle)] bg-[var(--surface-0)]/30">
          <h2 className="text-lg font-bold text-[var(--text-primary)]">Historial de pagos</h2>
        </div>
        {loading ? (
          <div className="p-8 text-center text-[var(--text-muted)] flex items-center justify-center gap-2"><Loader size={16} className="animate-spin" /> Cargando...</div>
        ) : payments.length === 0 ? (
          <div className="p-6"><EmptyState icon={DollarSign} title="Sin pagos registrados" description="Los pagos que registres para cualquier empresa van a aparecer acá." /></div>
        ) : (
          <Table
            columns={['Fecha', 'Empresa', 'Monto', 'Método', 'Referencia', 'Estado']}
            data={payments}
            renderRow={(p) => (
              <tr key={p.id} className="hover:bg-[var(--surface-2)]/50 transition-colors">
                <td className="px-4 py-3 text-zinc-400">{formatDate(new Date(p.payment_date))}</td>
                <td className="px-4 py-3 font-bold text-[var(--text-primary)]">{p.companies?.nombre_comercial || '—'}</td>
                <td className="px-4 py-3 font-bold text-emerald-400">{formatUSD(p.amount)}</td>
                <td className="px-4 py-3 text-zinc-400">{p.payment_method}</td>
                <td className="px-4 py-3 text-zinc-500 font-mono text-xs">{p.reference || '—'}</td>
                <td className="px-4 py-3 capitalize text-zinc-400">{p.status}</td>
              </tr>
            )}
          />
        )}
      </div>

      {modalCompany !== undefined && <PaymentModal company={modalCompany} onClose={closeModal} />}
    </div>
  );
}
