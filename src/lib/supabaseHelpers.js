import { supabase } from './supabase.js';

// invoices.issue_date es "timestamp without time zone" - Postgres la guarda
// TAL CUAL, sin convertir nada. new Date().toISOString() siempre da UTC
// (ej. 21:00 en Ecuador -> "...T02:00:00.000Z" del día siguiente); si esa
// string se guarda ahí y luego se relee con new Date(...), el faltante de
// "Z" hace que se reinterprete como hora LOCAL de quien la lea - en Vercel
// (UTC) el corrimiento de +5h se "cuela" igual, declarando la fecha
// siguiente al SRI para cualquier venta entre 19:00 y 23:59 hora Ecuador (se
// confirmó real y reproducible: una prueba de este tipo fue rechazada por el
// SRI con "FECHA EMISION EXTEMPORANEA" al correr en un entorno en horario de
// Ecuador, que además de correr el día también corre la hora, agravándolo).
// Esta función arma la hora LOCAL de quien la ejecuta (el navegador del
// punto de venta, que está físicamente en Ecuador) como string sin "Z" -  al
// guardarse tal cual y releerse en cualquier entorno con TZ=UTC (Vercel) o
// TZ=America/Guayaquil, ambos extraen el mismo día/hora correctos.
function toLocalNaiveTimestamp(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, '0')}`;
}

// Los triggers de límite de plan (supabase/migrations/20260724_plan_limit_enforcement.sql)
// rechazan el INSERT con un mensaje que empieza "PLAN_LIMIT: <texto humano>".
// Sin esto, cada create* de acá abajo antepone su propio "Error creating X:",
// y el usuario terminaría viendo "Error creating invoice: PLAN_LIMIT: ..." -
// technobabble duplicado sobre un mensaje que ya es humano de por sí. Se usa
// en cualquier create* que ahora puede chocar con uno de esos triggers.
function formatSupabaseError(error, fallbackPrefix) {
  const raw = error?.message || String(error);
  if (raw.startsWith('PLAN_LIMIT:')) return raw.slice('PLAN_LIMIT:'.length).trim();
  return `${fallbackPrefix}: ${raw}`;
}

// Header de autorización real para los endpoints de api/* que verifican el
// JWT (api/_authHelpers.js) en vez de confiar en un userId/companyId que el
// body simplemente afirmaba (Fase 1 de hardening, ver AUDITORIA_SISTEMA.md).
async function getAuthHeaders() {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) throw new Error('No hay sesión activa');
  return { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` };
}

// Companies
export async function fetchCompanies() {
  const { data, error } = await supabase
    .from('companies')
    // cert_password is column-level revoked for anon/authenticated - only
    // pull the non-secret cert fields, same allowlist getBillingConfig uses.
    .select('*, billing_configs(cert_storage_path, cert_uploaded_at)')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error fetching companies: ${error.message}`);
  return data;
}

// Liviana a propósito (un solo campo jsonb, no la fila completa) - se llama
// en login()/restoreAuth() para poder aplicar el tema del POS antes del
// primer render de POSLayout, sin esperar al fetch completo de la empresa
// que ya hace POSInterface.jsx por su cuenta.
export async function fetchCompanyUiSettings(companyId) {
  const { data, error } = await supabase
    .from('companies')
    .select('ui_settings')
    .eq('id', companyId)
    .single();
  if (error) throw new Error(`Error fetching company ui_settings: ${error.message}`);
  return data.ui_settings;
}

// Gerente-only: la RPC (set_company_ui_settings, migración
// 20260716_add_company_ui_settings.sql) valida internamente que el caller
// sea gerente de esa empresa - admin/gerente comparten el mismo rol de
// Postgres, así que una política RLS directa de UPDATE no podría restringir
// esto solo a esta columna. Un admin fijando el tema de una empresa NUEVA
// no pasa por acá - va directo en el insert de createCompany (ver
// CompanyWizard.jsx/submitWizard), sin restricción de rol.
export async function updateCompanyUiSettings(companyId, posTheme, posAccent) {
  const { data, error } = await supabase.rpc('set_company_ui_settings', {
    p_company_id: companyId,
    p_pos_theme: posTheme,
    p_pos_accent: posAccent
  });
  if (error) throw new Error(`Error updating ui_settings: ${error.message}`);
  return data;
}

// Cualquier rol puede fijar SU PROPIA preferencia (la RPC solo valida
// auth.uid() = fila objetivo, sin chequeo de rol - a diferencia de
// updateCompanyUiSettings, esto no es un dato compartido de la empresa).
export async function updateUserUiPreferences(panelMode) {
  const { data, error } = await supabase.rpc('set_ui_preferences', { p_panel_mode: panelMode });
  if (error) throw new Error(`Error updating ui_preferences: ${error.message}`);
  return data;
}

export async function fetchCompanyById(id) {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
    .eq('id', id)
    .single();

  if (error) throw new Error(`Error fetching company: ${error.message}`);
  return data;
}

export async function createCompany(companyData) {
  const { data, error } = await supabase
    .from('companies')
    .insert([companyData])
    .select()
    .single();

  if (error) throw new Error(`Error creating company: ${error.message}`);
  return data;
}

export async function updateCompany(id, updates) {
  const { data, error } = await supabase
    .from('companies')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error updating company: ${error.message}`);
  return data;
}

// Point of Sale (POS)
export async function fetchPointOfSales(companyId) {
  const { data, error } = await supabase
    .from('point_of_sales')
    .select('*')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error fetching POS: ${error.message}`);
  return data;
}

export async function createPointOfSale(posData) {
  const { data, error } = await supabase
    .from('point_of_sales')
    .insert([posData])
    .select()
    .single();

  if (error) throw new Error(formatSupabaseError(error, 'Error creating POS'));
  return data;
}

export async function updatePointOfSale(id, updates) {
  const { data, error } = await supabase
    .from('point_of_sales')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error updating POS: ${error.message}`);
  return data;
}

// Branches (Sucursales)
export async function fetchBranches(companyId) {
  const { data, error } = await supabase
    .from('branches')
    .select('*, point_of_sales(*)')
    .eq('company_id', companyId)
    .order('created_at', { ascending: true });

  if (error) throw new Error(`Error fetching branches: ${error.message}`);
  return data || [];
}

export async function createBranch(branchData) {
  const { data, error } = await supabase
    .from('branches')
    .insert([{
      company_id: branchData.companyId,
      name: branchData.name,
      code: branchData.code,
      address: branchData.address || null,
      city: branchData.city || null,
      phone: branchData.phone || null,
      establishment: branchData.establishment,
      is_active: true
    }])
    .select()
    .single();

  if (error) throw new Error(formatSupabaseError(error, 'Error creating branch'));
  return data;
}

export async function updateBranch(branchId, updates) {
  const updateData = {};
  if (updates.name !== undefined) updateData.name = updates.name;
  if (updates.code !== undefined) updateData.code = updates.code;
  if (updates.address !== undefined) updateData.address = updates.address;
  if (updates.city !== undefined) updateData.city = updates.city;
  if (updates.phone !== undefined) updateData.phone = updates.phone;
  if (updates.establishment !== undefined) updateData.establishment = updates.establishment;
  if (updates.isActive !== undefined) updateData.is_active = updates.isActive;

  const { data, error } = await supabase
    .from('branches')
    .update(updateData)
    .eq('id', branchId)
    .select()
    .single();

  if (error) throw new Error(`Error updating branch: ${error.message}`);
  return data;
}

// Resolves which branch + active point of sale a cashier should sell
// through, based on their assigned branch (users.branch_id). Cashiers with
// no branch, or whose branch has no active point of sale, have no valid
// establecimiento/punto de venta to put on an invoice - returns null so the
// POS can block selling with a clear message instead of guessing one.
export async function resolveCashierPointOfSale(userId) {
  const { data: user, error: userError } = await supabase
    .from('users')
    .select('id, branch_id')
    .eq('id', userId)
    .single();

  if (userError) throw new Error(`Error resolving cashier: ${userError.message}`);
  if (!user.branch_id) return null;

  const { data: branch, error: branchError } = await supabase
    .from('branches')
    .select('id, name, establishment')
    .eq('id', user.branch_id)
    .eq('is_active', true)
    .single();

  if (branchError) return null;

  const { data: posRows, error: posError } = await supabase
    .from('point_of_sales')
    .select('id, nombre, numero_establecimiento, numero_pos, sequential_current')
    .eq('branch_id', user.branch_id)
    .eq('is_active', true)
    .order('created_at', { ascending: true })
    .limit(1);

  if (posError) throw new Error(`Error fetching point of sale: ${posError.message}`);
  if (!posRows || posRows.length === 0) return null;

  return { branch, pointOfSale: posRows[0] };
}

// Punto de partida del turno a cerrar: el closed_at del último cierre de
// este cajero en este punto de venta, o si nunca cerró caja, la fecha en que
// se creó su login (no puede haber vendido antes de eso).
export async function resolveClosurePeriodStart(userId, pointOfSaleId) {
  const { data: lastClosure, error: closureError } = await supabase
    .from('cash_closures')
    .select('closed_at')
    .eq('user_id', userId)
    .eq('point_of_sale_id', pointOfSaleId)
    .order('closed_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (closureError) throw new Error(closureError.message);
  if (lastClosure) return lastClosure.closed_at;

  const { data: user, error: userError } = await supabase.from('users').select('created_at').eq('id', userId).single();
  if (userError) throw new Error(userError.message);
  return user.created_at;
}

// Facturas del turno a cerrar: de ESTE cajero, en ESTE punto de venta, desde
// el último cierre - las anuladas no cuentan (nunca hubo dinero real de por
// medio, igual que en el resto de los reportes de este proyecto).
export async function fetchInvoicesForClosure(userId, pointOfSaleId, sinceISO) {
  const { data, error } = await supabase
    .from('invoices')
    .select('id, total_amount, payment_method, issue_date, status')
    .eq('user_id', userId)
    .eq('pos_id', pointOfSaleId)
    .neq('status', 'anulada')
    .gt('issue_date', sinceISO)
    .order('issue_date', { ascending: true });
  if (error) throw new Error(error.message);
  return data || [];
}

// El insert lo hace el propio cajero (RLS: user_id = auth.uid(), rol
// vendedor/operario) - inmutable, no hay updateCashClosure.
export async function createCashClosure({ companyId, branchId, pointOfSaleId, userId, openedAt, expectedTotals, countedTotals, difference, notes }) {
  const { data, error } = await supabase
    .from('cash_closures')
    .insert({
      company_id: companyId,
      branch_id: branchId,
      point_of_sale_id: pointOfSaleId,
      user_id: userId,
      opened_at: openedAt,
      expected_totals: expectedTotals,
      counted_totals: countedTotals,
      difference,
      notes: notes || null
    })
    .select('*')
    .single();
  if (error) throw new Error(error.message);
  return data;
}

// Historial de cierres para la vista de lectura del gerente/contador -
// embebe cajero/sucursal/POS para no hacer un join manual en el componente.
export async function fetchCashClosures(companyId) {
  const { data, error } = await supabase
    .from('cash_closures')
    .select('*, users(name, email), branches(name), point_of_sales(nombre)')
    .eq('company_id', companyId)
    .order('closed_at', { ascending: false });
  if (error) throw new Error(error.message);
  return data || [];
}

// Mirrors getNextInvoiceSequential's read-then-write pattern, scoped to a
// single point of sale instead of the whole company - each POS now owns its
// own SRI sequential counter.
export async function getNextPosSequential(posId) {
  try {
    const { data: pos, error: fetchError } = await supabase
      .from('point_of_sales')
      .select('id, sequential_current')
      .eq('id', posId)
      .single();

    if (fetchError) throw new Error(fetchError.message);

    const sequential = pos?.sequential_current || 1;

    const { error: updateError } = await supabase
      .from('point_of_sales')
      .update({ sequential_current: sequential + 1 })
      .eq('id', posId);

    if (updateError) throw new Error(updateError.message);

    return sequential;
  } catch (error) {
    throw new Error(`Error getting next sequential: ${error.message}`);
  }
}

// Secuencial para cualquier documento que NO sea factura (hoy: nota de
// crédito) - a diferencia de getNextPosSequential, este usa el RPC atómico
// get_next_document_sequential (UPSERT ... RETURNING, sin condición de
// carrera posible) porque es mecanismo nuevo sin historial que preservar.
// Ver supabase/migrations/20260721_credit_notes_schema.sql.
export async function getNextDocumentSequential(posId, docType) {
  const { data, error } = await supabase.rpc('get_next_document_sequential', {
    p_point_of_sale_id: posId,
    p_doc_type: docType
  });
  if (error) throw new Error(`Error obteniendo el secuencial: ${error.message}`);
  return data;
}

// Notas de crédito ya emitidas contra una factura, para que la UI muestre el
// saldo disponible antes de enviar - la validación real (que no lo exceda)
// vuelve a correr server-side en submit-credit-note.js, esto es solo para UX.
export async function fetchCreditNotesForInvoice(invoiceId) {
  const { data, error } = await supabase
    .from('invoices')
    .select('*, invoice_details(*)')
    .eq('modified_invoice_id', invoiceId)
    .eq('invoice_type', 'nota_credito')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error obteniendo notas de crédito: ${error.message}`);
  return data || [];
}

// Per-branch inventory. products stays the shared catalog (code/name/price/
// tax/category); product_stock is the source of truth for quantities, one
// row per (product, branch). A product with no row yet for a given branch
// simply has 0 stock there - callers don't need to pre-seed anything, a
// missing row is a valid "no stock here" state, not an error.
export async function fetchProductStock(companyId, branchId) {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, code, name, category, sale_price, cost_price, tax_percentage, price_includes_vat, discount, promotion, is_active')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (productsError) throw new Error(`Error fetching products: ${productsError.message}`);

  const { data: stockRows, error: stockError } = await supabase
    .from('product_stock')
    .select('id, product_id, quantity, min_stock')
    .eq('branch_id', branchId);

  if (stockError) throw new Error(`Error fetching stock: ${stockError.message}`);

  const stockByProduct = new Map((stockRows || []).map(s => [s.product_id, s]));

  return (products || []).map(p => {
    const stock = stockByProduct.get(p.id);
    return {
      ...p,
      product_id: p.id,
      stock_id: stock?.id || null,
      quantity: stock?.quantity ?? 0,
      min_stock: stock?.min_stock ?? 0
    };
  });
}

// Same shape as fetchProductStock, but summed across every branch of the
// company - backs the "Todas las sucursales" aggregated view.
export async function fetchProductStockAllBranches(companyId) {
  const { data: products, error: productsError } = await supabase
    .from('products')
    .select('id, code, name, category, sale_price, cost_price, tax_percentage, price_includes_vat, discount, promotion, is_active')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (productsError) throw new Error(`Error fetching products: ${productsError.message}`);

  const { data: stockRows, error: stockError } = await supabase
    .from('product_stock')
    .select('product_id, branch_id, quantity, min_stock, branches!inner(company_id, name)')
    .eq('branches.company_id', companyId);

  if (stockError) throw new Error(`Error fetching stock: ${stockError.message}`);

  const byProduct = new Map();
  (stockRows || []).forEach(s => {
    const list = byProduct.get(s.product_id) || [];
    list.push({ branchId: s.branch_id, branchName: s.branches?.name, quantity: s.quantity, minStock: s.min_stock });
    byProduct.set(s.product_id, list);
  });

  return (products || []).map(p => {
    const branchStock = byProduct.get(p.id) || [];
    return {
      ...p,
      product_id: p.id,
      quantity: branchStock.reduce((sum, b) => sum + (b.quantity || 0), 0),
      min_stock: branchStock.reduce((sum, b) => sum + (b.minStock || 0), 0),
      branchStock
    };
  });
}

// Solo toca min_stock (el umbral de "stock bajo") - la cantidad real ya no
// se edita como upsert crudo, ver adjustProductStock más abajo. Separar los
// dos evita que alguien pise una cantidad ajustada por otra vía al mismo
// tiempo (upsert no es atómico ni queda auditado en el kardex).
export async function updateProductMinStock({ productId, branchId, minStock }) {
  const { data, error } = await supabase
    .from('product_stock')
    .upsert([{
      product_id: productId,
      branch_id: branchId,
      min_stock: parseInt(minStock) || 0,
      updated_at: new Date().toISOString()
    }], { onConflict: 'product_id,branch_id' })
    .select()
    .single();

  if (error) throw new Error(`Error updating stock: ${error.message}`);
  return data;
}

// Único camino para tocar product_stock.quantity (Fase 6 - kardex): la RPC
// adjust_product_stock es atómica (SELECT...FOR UPDATE) y deja un
// inventory_movements por cada llamada, con el delta REALMENTE aplicado
// (recortado a 0 como mínimo) - nunca el solicitado, así el saldo del
// kardex nunca diverge de product_stock. Reemplaza los upserts sueltos que
// tenían decrementProductStock (POS) y restockProduct (notas de crédito).
export async function adjustProductStock({ productId, branchId, delta, movementType, referenceId = null, referenceType = null, notes = null }) {
  const { data, error } = await supabase.rpc('adjust_product_stock', {
    p_product_id: productId,
    p_branch_id: branchId,
    p_delta: delta,
    p_movement_type: movementType,
    p_reference_id: referenceId,
    p_reference_type: referenceType,
    p_notes: notes
  });

  if (error) throw new Error(`Error ajustando inventario: ${error.message}`);
  return data?.[0] || null; // { new_quantity, applied_delta }
}

// Transferencia atómica entre sucursales (dos movimientos que comparten
// transfer_id, todo o nada - ver la función en la migración de Fase 6).
export async function transferStock({ productId, fromBranchId, toBranchId, quantity, notes = null }) {
  const { data, error } = await supabase.rpc('transfer_stock', {
    p_product_id: productId,
    p_from_branch_id: fromBranchId,
    p_to_branch_id: toBranchId,
    p_quantity: quantity,
    p_notes: notes
  });

  if (error) throw new Error(`Error transfiriendo stock: ${error.message}`);
  return data?.[0] || null; // { transfer_id, from_new_quantity, to_new_quantity }
}

// Historial de movimientos (kardex) de un producto en una sucursal, más
// viejo primero - así el balance corrida se puede calcular sumando en
// orden en el cliente sin necesitar una función de ventana en SQL.
export async function fetchInventoryMovements({ companyId, productId = null, branchId = null, startDate = null, endDate = null, limit = 500 }) {
  let query = supabase
    .from('inventory_movements')
    .select('*, products(code, name), branches(name), users(name)')
    .eq('company_id', companyId);

  if (productId) query = query.eq('product_id', productId);
  if (branchId) query = query.eq('branch_id', branchId);
  if (startDate) query = query.gte('created_at', startDate);
  if (endDate) query = query.lte('created_at', endDate);

  const { data, error } = await query.order('created_at', { ascending: true }).limit(limit);

  if (error) throw new Error(`Error cargando movimientos de inventario: ${error.message}`);
  return data || [];
}

// Subscriptions & Plans
export async function fetchPlans() {
  const { data, error } = await supabase
    .from('plans')
    .select('*')
    .order('price', { ascending: true });

  if (error) throw new Error(`Error fetching plans: ${error.message}`);
  return data;
}

export async function updatePlan(id, updates) {
  const { data, error } = await supabase
    .from('plans')
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error updating plan: ${error.message}`);
  return data;
}

// Activity Log
export async function fetchActivityLog(companyId = null, limit = 100) {
  let query = supabase
    .from('activity_log')
    .select('*, companies(nombre_comercial), users(name)');

  if (companyId) {
    query = query.eq('company_id', companyId);
  }

  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Error fetching activity log: ${error.message}`);
  return data;
}

export async function logActivity(companyId, action, description, userId = null) {
  const { data, error } = await supabase
    .from('activity_log')
    .insert([{
      company_id: companyId,
      action,
      description,
      user_id: userId,
      created_at: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw new Error(`Error logging activity: ${error.message}`);
  return data;
}

// Payments
export async function fetchPaymentHistory(companyId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false });

  if (error) throw new Error(`Error fetching payment history: ${error.message}`);
  return data;
}

export async function registerPayment(companyId, paymentData) {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      company_id: companyId,
      amount: paymentData.amount,
      method: paymentData.method,
      status: paymentData.status || 'pending',
      payment_date: paymentData.payment_date || new Date().toISOString(),
      reference: paymentData.reference
    }])
    .select()
    .single();

  if (error) throw new Error(`Error registering payment: ${error.message}`);
  return data;
}

// Authentication
export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw new Error(`Error signing up: ${error.message}`);
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Error signing in: ${error.message}`);
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw new Error(`Error signing out: ${error.message}`);
}

export async function getCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) throw new Error(`Error getting user: ${error.message}`);
  return user;
}

// User Authentication - Supabase Auth (login real, con sesión y JWT). Reemplaza
// el viejo validateAdminCredentials()/verify_user_password (comparación bcrypt
// manual sin sesión). Devuelve la misma forma {id, email, name, role,
// company_id} que antes para no tocar los ~68 sitios que leen currentUser.*.
export async function loginWithPassword(email, password) {
  const { data: authData, error: authError } = await supabase.auth.signInWithPassword({ email, password });
  if (authError) {
    throw new Error('Email o contraseña inválidos');
  }

  // Filtra por el propio auth.uid() explícitamente - sin esto, la política RLS
  // de users (company_id = current_company_id() OR id = auth.uid() OR admin)
  // devolvería TODOS los usuarios de la empresa para un gerente, no solo el
  // suyo, y .single() fallaría con "multiple rows".
  const { data, error } = await supabase
    .from('users')
    .select('id, email, name, role, company_id, is_active, ui_preferences')
    .eq('id', authData.user.id)
    .single();

  if (error || !data || !data.is_active) {
    await supabase.auth.signOut();
    throw new Error('Tu usuario está desactivado. Contacta a tu administrador.');
  }

  await supabase.rpc('record_login', { p_user_id: data.id });

  const { is_active, ...user } = data;
  return user;
}

export async function getAdminUser(email) {
  const { data, error } = await supabase
    .from('admin_users')
    .select('id, email, name, role, is_active')
    .eq('email', email)
    .single();

  if (error) throw new Error(`Error fetching admin user: ${error.message}`);
  return data;
}

// users.password_hash is column-level revoked for anon/authenticated (see
// migration fix_users_password_exposure_and_cashier_rpcs), so select('*')
// against this table now errors - always use an explicit column list here.
export async function fetchCompanyUsers(companyId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, company_id, email, name, phone, role, is_active, last_login, created_at, branch_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Error fetching users: ${error.message}`);
  return data || [];
}

// Creates a vendedor/operario/contador login and emails them a welcome +
// temp password. Goes through api/admin/users.js (action: 'create-user',
// generaliza el viejo create-cashier.js, que solo aceptaba vendedor/operario)
// so the plaintext password can be emailed server-side without ever living
// in the browser bundle. contador no lleva branchId (a nivel empresa, no de
// sucursal).
export async function createCompanyUser({ companyId, email, password, name, role, phone, branchId }) {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'create-user', companyId, email, password, name, role, phone, branchId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al crear el usuario');
  return result;
}

// Reassigns an existing cashier to a different branch (or unassigns with
// branchId=null). The RPC verifies callerId is the gerente of companyId (or
// admin) before touching anything - it used to trust company_id+user_id alone.
export async function updateUserBranch({ companyId, userId, branchId, callerId }) {
  const { data, error } = await supabase.rpc('update_user_branch', {
    p_company_id: companyId,
    p_user_id: userId,
    p_branch_id: branchId,
    p_caller_id: callerId
  });

  if (error) throw new Error(error.message);
  return data?.[0];
}

// Creates the initial gerente login for a newly onboarded client company
// (admin-side, CompanyWizard) and emails them their temp password. Goes through
// api/admin/users.js (action: 'create-gerente'), which verifies the caller is
// a real admin (JWT) before creating the Auth user + profile with the service
// role - closing the §1.1.1 audit hole where anyone could self-provision a
// gerente login.
export async function createCompanyGerente({ companyId, email, password, name }) {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'create-gerente', companyId, email, password, name })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al crear el gerente');
  return result;
}

// Emails the RIDE (PDF, generated in-browser with jsPDF as Base64) of an
// authorized invoice to the customer. The endpoint re-validates the invoice is
// 'autorizada' and pulls the recipient from the DB - the browser never chooses
// who receives it.
export async function emailInvoiceRide({ invoiceId, pdfBase64 }) {
  const response = await fetch('/api/emails/send-invoice-ride', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ invoiceId, pdfBase64 })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al enviar el RIDE por correo');
  return result;
}

// Lets a gerente set a new password for one of their cashiers. Goes through
// api/admin/users.js (action: 'reset-cashier-password', service role)
// because resetting an Auth password requires auth.admin.updateUserById,
// never available to the browser - this used to be a direct RPC call with
// the anon key.
export async function resetCashierPassword({ companyId, userId, newPassword }) {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'reset-cashier-password', companyId, userId, newPassword })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al resetear la contraseña');
  return result.user;
}

// Reconsulta el estado de una factura 'devuelta' contra el SRI sin
// reenviarla - ver api/sri/reconcile-invoice.js para por qué esto no podía
// ser simplemente api/sri/status.js (ese endpoint no consulta comprobantes,
// solo hace ping a las URLs del SRI).
export async function reconcileInvoiceStatus({ invoiceId }) {
  const response = await fetch('/api/sri/reconcile-invoice', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ invoiceId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al reconsultar la factura');
  return result;
}

// Última corrida del cron de reintentos automáticos (api/sri/retry-pending.js,
// Fase 3) para la empresa de quien llama - la función SQL ya filtra por
// current_company_id() internamente, no hace falta (ni se puede) pedir la de
// otra empresa. activity_log en general solo lo lee is_platform_admin(); esta
// RPC expone selectivamente solo esta fila puntual, sin ampliar ese acceso.
export async function fetchLastSriRetrySweep() {
  const { data, error } = await supabase.rpc('get_last_sri_retry_sweep');
  if (error) throw new Error(`Error obteniendo la última barrida automática: ${error.message}`);
  return data?.[0] || null;
}

// Conteo de facturas del mes en curso por empresa, contado EN VIVO contra
// invoices (mismo criterio que el trigger de límite de plan - ver
// supabase/migrations/20260724_plan_limit_enforcement.sql), no el contador
// companies.monthly_comprobantes ya retirado. Solo admin de plataforma (la
// RPC devuelve vacío para cualquier otro rol, no un error).
export async function fetchMonthlyInvoiceCounts() {
  const { data, error } = await supabase.rpc('get_monthly_invoice_counts');
  if (error) throw new Error(`Error obteniendo el consumo de comprobantes: ${error.message}`);
  const byCompany = {};
  (data || []).forEach(row => {
    byCompany[row.company_id] = {
      current: Number(row.invoice_count) || 0,
      previous: Number(row.prev_month_count) || 0
    };
  });
  return byCompany;
}

// Admin-side password reset for any company user (gerente included) - goes
// through api/admin/users.js (action: 'reset-user-password', service role),
// which emails the new temp password to the user. The underlying RPC is not
// anon-executable.
export async function adminResetUserPassword({ companyId, userId, newPassword }) {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'reset-user-password', companyId, userId, newPassword })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al restablecer la contraseña');
  return result;
}

// Admin-side activate/deactivate for any company user (gerente or cajero).
export async function adminSetUserActive({ companyId, userId, isActive }) {
  const response = await fetch('/api/admin/users', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ action: 'set-user-active', companyId, userId, isActive })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al actualizar el estado del usuario');
  return result;
}

// Generic functions
export async function fetchData(table, options = {}) {
  let query = supabase.from(table).select(options.select || '*');

  if (options.filter) {
    query = query.eq(options.filter.column, options.filter.value);
  }

  if (options.orderBy) {
    query = query.order(options.orderBy.column, { ascending: options.orderBy.ascending !== false });
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  const { data, error } = await query;
  if (error) throw new Error(`Error fetching from ${table}: ${error.message}`);
  return data;
}

export async function insertData(table, data) {
  const { data: result, error } = await supabase
    .from(table)
    .insert([data])
    .select()
    .single();

  if (error) throw new Error(`Error inserting into ${table}: ${error.message}`);
  return result;
}

export async function updateData(table, id, updates) {
  const { data, error } = await supabase
    .from(table)
    .update(updates)
    .eq('id', id)
    .select()
    .single();

  if (error) throw new Error(`Error updating ${table}: ${error.message}`);
  return data;
}

export async function deleteData(table, id) {
  const { error } = await supabase
    .from(table)
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error deleting from ${table}: ${error.message}`);
  return true;
}

// Products - Complete CRUD
// Stock (quantity/min_stock) is no longer written here - it lives per-branch
// in product_stock now. Every branch of the company gets seeded so the
// product shows up everywhere immediately; the branch the gerente was
// actively managing gets the entered starting quantity, the rest start at 0.
export async function createProduct(productData) {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([{
        code: productData.code,
        name: productData.name,
        category: productData.category,
        company_id: productData.company_id,
        cost_price: parseFloat(productData.costPrice) || 0,
        sale_price: parseFloat(productData.salePrice),
        price_includes_vat: productData.priceIncludesVat !== false,
        discount: parseFloat(productData.discount) || 0,
        promotion: productData.promotion || '',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);

    // Seed stock only for the branch the gerente was actively managing -
    // other branches implicitly show 0 until they get their own
    // product_stock row (fetchProductStock treats a missing row as 0).
    if (productData.branchId) {
      const { error: stockError } = await supabase.from('product_stock').insert([{
        product_id: data.id,
        branch_id: productData.branchId,
        quantity: parseInt(productData.quantity) || 0,
        min_stock: parseInt(productData.minStock) || 10
      }]);
      if (stockError) throw new Error(stockError.message);
    }

    return data;
  } catch (error) {
    throw new Error(formatSupabaseError(error, 'Error creating product'));
  }
}

// Catalog fields only (price/discount/promotion/etc, shared across
// branches) - quantity/min_stock are edited per-branch via
// upsertProductStock instead. Build the payload from scratch with only real
// column names rather than spreading `updates` - a previous version spread
// the raw camelCase object first and Supabase/PostgREST rejected the whole
// request over the unknown keys.
export async function updateProduct(productId, updates) {
  try {
    const updateData = {};
    if (updates.costPrice !== undefined) updateData.cost_price = parseFloat(updates.costPrice);
    if (updates.salePrice !== undefined) updateData.sale_price = parseFloat(updates.salePrice);
    if (updates.discount !== undefined) updateData.discount = parseFloat(updates.discount);
    if (updates.promotion !== undefined) updateData.promotion = updates.promotion;
    if (updates.priceIncludesVat !== undefined) updateData.price_includes_vat = updates.priceIncludesVat;
    if (updates.category !== undefined) updateData.category = updates.category;
    if (updates.name !== undefined) updateData.name = updates.name;

    const { data, error } = await supabase
      .from('products')
      .update(updateData)
      .eq('id', productId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error updating product: ${error.message}`);
  }
}

export async function deleteProduct(productId) {
  try {
    const { error } = await supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) throw new Error(error.message);
    return true;
  } catch (error) {
    throw new Error(`Error deleting product: ${error.message}`);
  }
}

export async function fetchProductsByCompany(companyId) {
  try {
    const { data, error } = await supabase
      .from('products')
      .select('*')
      .eq('company_id', companyId)
      .order('created_at', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching products: ${error.message}`);
  }
}

// Customers
export async function findCustomerByIdentification(companyId, identificationNumber) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .select('id, identification_type, identification_number, name, email, phone, address')
      .eq('company_id', companyId)
      .eq('identification_number', identificationNumber)
      .limit(1);

    if (error) throw new Error(error.message);
    return data && data.length > 0 ? data[0] : null;
  } catch (error) {
    throw new Error(`Error finding customer: ${error.message}`);
  }
}

export async function findOrCreateCustomer(companyId, customerData) {
  try {
    const { data: existing, error: findError } = await supabase
      .from('customers')
      .select('id')
      .eq('company_id', companyId)
      .eq('identification_number', customerData.identification_number)
      .limit(1);

    if (findError) throw new Error(findError.message);

    if (existing && existing.length > 0) {
      return existing[0].id;
    }

    const { data: created, error: createError } = await supabase
      .from('customers')
      .insert([{
        company_id: companyId,
        identification_type: customerData.identification_type,
        identification_number: customerData.identification_number,
        name: customerData.name,
        email: customerData.email || null,
        phone: customerData.phone || null,
        address: customerData.address || null,
        is_active: true
      }])
      .select('id')
      .single();

    if (createError) throw new Error(createError.message);
    return created.id;
  } catch (error) {
    throw new Error(`Error finding/creating customer: ${error.message}`);
  }
}

export async function updateCustomer(customerId, customerData) {
  try {
    const { data, error } = await supabase
      .from('customers')
      .update({
        name: customerData.name,
        email: customerData.email || null,
        phone: customerData.phone || null,
        address: customerData.address || null
      })
      .eq('id', customerId)
      .select('id, identification_type, identification_number, name, email, phone, address')
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error updating customer: ${error.message}`);
  }
}

// Suppliers (Compras - Fase 2, espejo de Customers)
export async function fetchSuppliers(companyId) {
  const { data, error } = await supabase
    .from('suppliers')
    .select('*')
    .eq('company_id', companyId)
    .order('razon_social', { ascending: true });

  if (error) throw new Error(`Error fetching suppliers: ${error.message}`);
  return data || [];
}

// El 23505 acá SIEMPRE es el RUC duplicado (suppliers solo tiene esa
// restricción unique) - se traduce a un mensaje humano en vez de dejar
// pasar el error crudo de Postgres, que es el criterio de aceptación de
// esta fase.
export async function createSupplier(supplierData) {
  const { data, error } = await supabase
    .from('suppliers')
    .insert([{
      company_id: supplierData.company_id,
      ruc: supplierData.ruc,
      razon_social: supplierData.razon_social,
      nombre_comercial: supplierData.nombre_comercial || null,
      direccion: supplierData.direccion || null,
      telefono: supplierData.telefono || null,
      email: supplierData.email || null,
      tipo_contribuyente: supplierData.tipo_contribuyente,
      es_parte_relacionada: supplierData.es_parte_relacionada || false
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un proveedor con este RUC en tu empresa');
    throw new Error(`Error creating supplier: ${error.message}`);
  }
  return data;
}

export async function updateSupplier(supplierId, supplierData) {
  const { data, error } = await supabase
    .from('suppliers')
    .update({
      razon_social: supplierData.razon_social,
      nombre_comercial: supplierData.nombre_comercial || null,
      direccion: supplierData.direccion || null,
      telefono: supplierData.telefono || null,
      email: supplierData.email || null,
      tipo_contribuyente: supplierData.tipo_contribuyente,
      es_parte_relacionada: supplierData.es_parte_relacionada || false,
      is_active: supplierData.is_active
    })
    .eq('id', supplierId)
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un proveedor con este RUC en tu empresa');
    throw new Error(`Error updating supplier: ${error.message}`);
  }
  return data;
}

// Purchases (Compras - Fase 3)

// Catálogo global (sin company_id, ver migración de la Fase 1) - lo puede
// leer cualquier usuario autenticado, así que no filtra por empresa.
export async function fetchRetentionConcepts() {
  const { data, error } = await supabase
    .from('retention_concepts')
    .select('*')
    .eq('is_active', true)
    .order('codigo_sri', { ascending: true });

  if (error) throw new Error(`Error fetching retention concepts: ${error.message}`);
  return data || [];
}

export async function createRetentionConcept(conceptData) {
  const { data, error } = await supabase
    .from('retention_concepts')
    .insert([{
      codigo_sri: conceptData.codigo_sri,
      descripcion: conceptData.descripcion,
      porcentaje_renta_sugerido: conceptData.porcentaje_renta_sugerido || 0,
      aplica_iva: conceptData.aplica_iva || false,
      porcentaje_iva_sugerido: conceptData.porcentaje_iva_sugerido || 0
    }])
    .select()
    .single();

  if (error) {
    if (error.code === '23505') throw new Error('Ya existe un concepto con ese código SRI');
    throw new Error(`Error creating retention concept: ${error.message}`);
  }
  return data;
}

export async function fetchPurchases(companyId) {
  const { data, error } = await supabase
    .from('purchases')
    .select('*, suppliers(razon_social, ruc), branches(name), purchase_retentions(id, retention_sri_status)')
    .eq('company_id', companyId)
    .order('document_date', { ascending: false });

  if (error) throw new Error(`Error fetching purchases: ${error.message}`);
  return data || [];
}

export async function fetchPurchaseDetail(purchaseId) {
  const [{ data: purchase, error: purchaseError }, { data: details, error: detailsError }, { data: retentions, error: retentionsError }] = await Promise.all([
    supabase.from('purchases').select('*, suppliers(*), branches(name)').eq('id', purchaseId).single(),
    supabase.from('purchase_details').select('*').eq('purchase_id', purchaseId).order('created_at', { ascending: true }),
    supabase.from('purchase_retentions').select('*, retention_concepts(codigo_sri, descripcion)').eq('purchase_id', purchaseId).order('created_at', { ascending: true })
  ]);

  if (purchaseError) throw new Error(`Error fetching purchase: ${purchaseError.message}`);
  if (detailsError) throw new Error(`Error fetching purchase details: ${detailsError.message}`);
  if (retentionsError) throw new Error(`Error fetching purchase retentions: ${retentionsError.message}`);

  return { purchase, details: details || [], retentions: retentions || [] };
}

// Orquesta el alta completa de una compra: cabecera -> líneas -> retenciones
// -> cuenta por pagar (saldo neto = total - retenciones). Mismo patrón que
// createInvoice()+createInvoiceDetail() en POSInterface.jsx - inserts
// secuenciales desde el cliente, sin una transacción real que los agrupe
// (igual riesgo de fallo parcial que ya acepta ese camino existente, no es
// un estándar nuevo para esta fase). Si algo después de crear la cabecera
// falla, la compra queda registrada sin su detalle/retención/CxP - el
// caller debe mostrarle el error al usuario para que reintente o corrija a
// mano, no hay rollback automático.
export async function createPurchaseWithDetails({ header, lines, retentions }) {
  const { data: purchase, error: purchaseError } = await supabase
    .from('purchases')
    .insert([{
      company_id: header.company_id,
      branch_id: header.branch_id || null,
      supplier_id: header.supplier_id,
      purchase_doc_type: header.purchase_doc_type,
      supplier_document_number: header.supplier_document_number,
      supplier_access_key: header.supplier_access_key || null,
      document_date: header.document_date,
      subtotal_0: header.subtotal_0,
      subtotal_iva: header.subtotal_iva,
      iva_amount: header.iva_amount,
      total: header.total,
      source: header.source || 'manual',
      xml_file_path: header.xml_file_path || null,
      created_by: header.created_by
    }])
    .select()
    .single();

  if (purchaseError) {
    if (purchaseError.code === '23505') throw new Error('Ya registraste una compra con ese número de documento para este proveedor');
    throw new Error(`Error creating purchase: ${purchaseError.message}`);
  }

  if (lines.length > 0) {
    const { error: linesError } = await supabase.from('purchase_details').insert(
      lines.map(l => ({
        purchase_id: purchase.id,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        discount: l.discount || 0,
        iva_rate: l.iva_rate || 0,
        subtotal: l.subtotal
      }))
    );
    if (linesError) throw new Error(`Error saving purchase details: ${linesError.message}`);
  }

  let totalRetained = 0;
  if (retentions.length > 0) {
    const { error: retentionsError } = await supabase.from('purchase_retentions').insert(
      retentions.map(r => ({
        purchase_id: purchase.id,
        retention_type: r.retention_type,
        retention_concept_id: r.retention_concept_id,
        retention_percentage: r.retention_percentage,
        retention_base: r.retention_base,
        retention_amount: r.retention_amount
      }))
    );
    if (retentionsError) throw new Error(`Error saving purchase retentions: ${retentionsError.message}`);
    totalRetained = retentions.reduce((sum, r) => sum + parseFloat(r.retention_amount), 0);
  }

  const netAmount = parseFloat(header.total) - totalRetained;
  const { data: accountsPayable, error: apError } = await supabase
    .from('accounts_payable')
    .insert([{
      purchase_id: purchase.id,
      company_id: header.company_id,
      supplier_id: header.supplier_id,
      original_amount: netAmount,
      due_date: header.due_date || null
    }])
    .select()
    .single();
  if (apError) throw new Error(`Error creating accounts payable: ${apError.message}`);

  return { purchase, accountsPayable };
}

// Sube el XML original del proveedor sin tocarlo (nunca se firma ni se
// reenvía como propio) a un bucket privado, scopeado por empresa vía RLS
// (storage.foldername(name)[1] = current_company_id(), ver migración de
// Fase 5) - subida directa desde el cliente, mismo patrón que
// uploadCompanyLogo, no hace falta un endpoint server-side para esto.
export async function uploadSupplierInvoiceXml(companyId, file) {
  if (!file) throw new Error('Selecciona un archivo XML');
  if (!file.name.toLowerCase().endsWith('.xml')) throw new Error('El archivo debe ser un .xml');
  if (file.size > 5 * 1024 * 1024) throw new Error('El archivo no debe superar 5MB');

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
  const storagePath = `${companyId}/${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from('supplier-invoices')
    .upload(storagePath, file, { cacheControl: '3600' });

  if (uploadError) throw new Error(`Error subiendo el XML: ${uploadError.message}`);
  return storagePath;
}

export async function downloadSupplierInvoiceXml(storagePath) {
  const { data, error } = await supabase.storage.from('supplier-invoices').download(storagePath);
  if (error) throw new Error(`Error descargando el XML: ${error.message}`);
  return data; // Blob
}

// Consulta el estado de autorización real de un documento del proveedor
// contra el SRI - nunca firma ni reenvía nada, solo pregunta.
export async function verifySupplierDocument(accessKey) {
  const response = await fetch('/api/sri/verify-supplier-document', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ accessKey })
  });

  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`El servidor no respondió correctamente (status ${response.status}). Respuesta: ${rawText.slice(0, 300)}`);
  }

  if (!response.ok) {
    throw new Error(result.error || 'Error al verificar el comprobante ante el SRI');
  }

  return result;
}

// Accounts Payable (Compras - Fase 6)

// Trae cada cuenta con sus pagos embebidos - el saldo restante se calcula
// en el cliente (original_amount - suma de pagos), no se guarda una
// columna aparte que se pueda desincronizar (mismo criterio que el kardex
// de inventario en Ventas). status (pendiente/parcial/pagada) sí es una
// columna real, pero la mantiene el trigger de la Fase 1, nunca esta capa.
export async function fetchAccountsPayable(companyId) {
  const { data, error } = await supabase
    .from('accounts_payable')
    .select('*, suppliers(razon_social, ruc), purchases(supplier_document_number, purchase_doc_type, document_date), accounts_payable_payments(id, amount, payment_date, payment_method_id, notes, created_at, payment_methods(name))')
    .eq('company_id', companyId)
    .order('due_date', { ascending: true, nullsFirst: false });

  if (error) throw new Error(`Error fetching accounts payable: ${error.message}`);
  return data || [];
}

// Inmutable por diseño (sin política de UPDATE/DELETE, ver migración de la
// Fase 1) - una corrección se registra como un pago nuevo, incluso negativo
// si hace falta reversar, nunca editando uno existente.
export async function createAccountsPayablePayment({ accountsPayableId, amount, paymentMethodId, paymentDate, notes, createdBy }) {
  const { data, error } = await supabase
    .from('accounts_payable_payments')
    .insert([{
      accounts_payable_id: accountsPayableId,
      amount,
      payment_method_id: paymentMethodId,
      payment_date: paymentDate || new Date().toISOString().slice(0, 10),
      notes: notes || null,
      created_by: createdBy
    }])
    .select()
    .single();

  if (error) throw new Error(`Error registering payment: ${error.message}`);
  return data;
}

// Reportes de Compras (Fase 7). startStr/endStr deben ser 'YYYY-MM-DD'
// locales (no toISOString(): document_date es un `date` sin hora, y
// convertir a UTC puede correr la fecha un día en zonas UTC- como Ecuador -
// el mismo motivo por el que Fase 1 evitó timestamp without time zone).
export async function fetchPurchasesForReports(companyId, startStr, endStr) {
  let query = supabase
    .from('purchases')
    .select('*, suppliers(id, razon_social, ruc), purchase_retentions(id, retention_type, retention_percentage, retention_base, retention_amount, retention_sri_status, retention_concept_id, retention_concepts(codigo_sri, descripcion))')
    .eq('company_id', companyId)
    .order('document_date', { ascending: false });

  if (startStr) query = query.gte('document_date', startStr);
  if (endStr) query = query.lte('document_date', endStr);

  const { data, error } = await query;
  if (error) throw new Error(`Error fetching purchases report data: ${error.message}`);
  return data || [];
}

// Invoices & Billing
// pos_id must be resolved by the caller (the cashier's assigned branch's
// active point of sale - see resolveCashierPointOfSale) rather than guessed
// here, since which POS a sale belongs to determines its real establecimiento
// / punto de venta / secuencial for the SRI.
export async function createInvoice(invoiceData) {
  try {
    if (!invoiceData.pos_id) {
      throw new Error('No se pudo determinar el punto de venta de esta factura');
    }

    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        company_id: invoiceData.company_id,
        user_id: invoiceData.user_id,
        pos_id: invoiceData.pos_id,
        customer_id: invoiceData.customer_id || null,
        invoice_type: invoiceData.invoice_type || 'factura',
        invoice_number: invoiceData.invoice_number,
        issue_date: toLocalNaiveTimestamp(new Date()),
        authorization_number: invoiceData.access_key || null,
        subtotal: parseFloat(invoiceData.subtotal_amount) || 0,
        discount_amount: parseFloat(invoiceData.discount_amount) || 0,
        tax_amount: parseFloat(invoiceData.tax_amount) || 0,
        total_amount: parseFloat(invoiceData.total_amount) || 0,
        payment_method: invoiceData.payment_method || 'cash',
        status: 'borrador',
        notes: invoiceData.notes || '',
        modified_invoice_id: invoiceData.modified_invoice_id || null,
        credit_note_reason: invoiceData.credit_note_reason || null,
        credit_note_restock: !!invoiceData.credit_note_restock
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(formatSupabaseError(error, 'Error creating invoice'));
  }
}

export async function createInvoiceDetail(detailData) {
  try {
    const { data, error } = await supabase
      .from('invoice_details')
      .insert([{
        invoice_id: detailData.invoice_id,
        product_id: detailData.product_id,
        product_code: detailData.product_code,
        product_name: detailData.product_name,
        quantity: parseFloat(detailData.quantity),
        unit_price: parseFloat(detailData.unit_price),
        discount_percent: parseFloat(detailData.discount_percent) || 0,
        subtotal: parseFloat(detailData.subtotal),
        tax_percent: parseFloat(detailData.tax_rate) || 12,
        tax_amount: parseFloat(detailData.tax_amount),
        total: parseFloat(detailData.total)
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error creating invoice detail: ${error.message}`);
  }
}

export async function fetchInvoicesByCompany(companyId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .select('*, customers(name, identification_type, identification_number, email, phone), point_of_sales(id, nombre, branch_id, numero_establecimiento, numero_pos, branches(name))')
      .eq('company_id', companyId)
      .order('issue_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching invoices: ${error.message}`);
  }
}

// Fetches invoices with their customer and line items embedded in one round
// trip, scoped to a date range - the base dataset the Reportes view builds
// every report tab from (see reportsHelpers.js).
export async function fetchInvoicesForReports(companyId, startISO, endISO) {
  try {
    let query = supabase
      .from('invoices')
      .select('*, customers(name, identification_type, identification_number), invoice_details(*), point_of_sales(id, nombre, branch_id, numero_establecimiento, numero_pos)')
      .eq('company_id', companyId)
      .order('issue_date', { ascending: false });

    if (startISO) query = query.gte('issue_date', startISO);
    if (endISO) query = query.lte('issue_date', endISO);

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching report data: ${error.message}`);
  }
}

export async function fetchInvoiceDetails(invoiceId) {
  try {
    const { data, error } = await supabase
      .from('invoice_details')
      .select('*')
      .eq('invoice_id', invoiceId)
      .order('created_at', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching invoice details: ${error.message}`);
  }
}

export async function updateInvoiceStatus(invoiceId, status) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({ status })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error updating invoice status: ${error.message}`);
  }
}

export async function approveInvoice(invoiceId) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'autorizada',
        authorization_date: new Date().toISOString()
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error approving invoice: ${error.message}`);
  }
}

export async function voidInvoice(invoiceId, reason) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .update({
        status: 'anulada',
        voided_at: new Date().toISOString(),
        voided_reason: reason || null
      })
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error voiding invoice: ${error.message}`);
  }
}

export async function submitInvoiceToSRI(invoiceId) {
  const response = await fetch('/api/sri/submit-invoice', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ invoiceId })
  });

  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`El servidor no respondió correctamente (status ${response.status}). Respuesta: ${rawText.slice(0, 300)}`);
  }

  if (!response.ok) {
    const error = new Error(result.error || 'Error al enviar la factura al SRI');
    error.detail = result.detail;
    throw error;
  }

  return result;
}

export async function submitCreditNoteToSRI(invoiceId) {
  const response = await fetch('/api/sri/submit-credit-note', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ invoiceId })
  });

  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`El servidor no respondió correctamente (status ${response.status}). Respuesta: ${rawText.slice(0, 300)}`);
  }

  if (!response.ok) {
    const error = new Error(result.error || 'Error al enviar la nota de crédito al SRI');
    error.detail = result.detail;
    throw error;
  }

  return result;
}

// pointOfSaleId/sequential deben resolverse ANTES de llamar esto, con la
// sesión real del gerente (getNextDocumentSequential) - el endpoint corre
// con service_role y no puede resolverlos él mismo (current_company_id()
// depende de auth.uid(), que no existe en ese contexto). Mismo patrón que
// ya usa la nota de crédito en InvoiceManagement.jsx.
export async function submitRetentionToSri(purchaseId, pointOfSaleId, sequential) {
  const response = await fetch('/api/sri/submit-retention', {
    method: 'POST',
    headers: await getAuthHeaders(),
    body: JSON.stringify({ purchaseId, pointOfSaleId, sequential })
  });

  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`El servidor no respondió correctamente (status ${response.status}). Respuesta: ${rawText.slice(0, 300)}`);
  }

  if (!response.ok) {
    const error = new Error(result.error || 'Error al enviar el comprobante de retención al SRI');
    error.detail = result.detail;
    throw error;
  }

  return result;
}

// On-demand reachability check for the SRI webservices (test + production),
// via a serverless proxy (api/sri/status.js) to avoid a CORS request straight
// from the browser to gob.ec.
export async function checkSriStatus() {
  const response = await fetch('/api/sri/status');
  const rawText = await response.text();
  let result;
  try {
    result = JSON.parse(rawText);
  } catch {
    throw new Error(`El servidor no respondió correctamente (status ${response.status})`);
  }
  if (!response.ok) throw new Error(result.error || 'Error al verificar el estado del SRI');
  return result;
}

// "Olvidé mi contraseña" - sin sesión (quien llama todavía no puede
// autenticarse), por eso no usa getAuthHeaders(). La respuesta es siempre
// {ok:true, message} sin importar si el correo existe o no - ver
// api/admin/request-password-reset.js.
export async function requestPasswordReset(email) {
  const response = await fetch('/api/admin/request-password-reset', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email })
  });
  const result = await response.json().catch(() => ({}));
  return result.message || 'Si el correo está registrado, te enviamos un enlace para restablecer tu contraseña.';
}

export async function getNextInvoiceSequential(companyId) {
  try {
    // Read current sequential counter from billing config
    const { data: config, error: fetchError } = await supabase
      .from('billing_configs')
      .select('id, current_sequential')
      .eq('company_id', companyId)
      .single();

    if (fetchError && fetchError.code !== 'PGRST116') throw new Error(fetchError.message);

    const sequential = config?.current_sequential || 1;

    // Advance the counter for the next invoice
    if (config) {
      const { error: updateError } = await supabase
        .from('billing_configs')
        .update({ current_sequential: sequential + 1 })
        .eq('company_id', companyId);

      if (updateError) throw new Error(updateError.message);
    }

    return sequential;
  } catch (error) {
    throw new Error(`Error getting next sequential: ${error.message}`);
  }
}

export async function saveBillingConfig(companyId, config) {
  try {
    // Step 1: Update companies table with identification data
    const companyUpdateData = {
      ruc: config.ruc || null,
      razon_social: config.razonSocial || null,
      nombre_comercial: config.nombreComercial || null,
      direccion: config.address || null,
      telefono_facturacion: config.phone || null,
      email_facturacion: config.email || null,
      lleva_contabilidad: config.llevaContabilidad || false
    };

    const { error: companyError } = await supabase
      .from('companies')
      .update(companyUpdateData)
      .eq('id', companyId);

    if (companyError) throw new Error(`Error updating company: ${companyError.message}`);

    // Step 2: Check if billing config exists for this company
    const { data: existing, error: fetchError } = await supabase
      .from('billing_configs')
      .select('id')
      .eq('company_id', companyId)
      .single();

    const configData = {
      company_id: companyId,
      establishment: config.establishment || '001',
      point_of_sale: config.pointOfSale || '001',
      sri_environment: config.environment || 'production',
      sri_username: config.sriUsername || null,
      sri_password_encrypted: config.sriPassword || null,
      sri_test_mode: config.sriTestMode !== false,
      current_sequential: config.currentSequential || 1,
      accounting_regime: config.accountingRegime || 'general',
      tax_rate: parseFloat(config.taxRate) || 12.00,
      receipt_footer_text: config.receiptFooterText || '',
      auto_send_sri: config.autoSendSRI || false,
      store_phone: config.phone || '',
      store_email: config.email || '',
      store_address: config.address || ''
    };

    let result;

    // Exclude cert_password from the RETURNING columns - the client has no SELECT
    // grant on it (bare .select() defaults to SELECT * and would fail entirely)
    const returnColumns = 'id, company_id, establishment, point_of_sale, sri_environment, sri_test_mode, current_sequential, accounting_regime, tax_rate, receipt_footer_text, auto_send_sri, store_phone, store_email, store_address, cert_storage_path, cert_uploaded_at';

    // Step 3: Insert or update billing_configs
    if (existing) {
      // Update existing config
      const { data, error } = await supabase
        .from('billing_configs')
        .update(configData)
        .eq('company_id', companyId)
        .select(returnColumns)
        .single();

      if (error) throw new Error(error.message);
      result = data;
    } else {
      // Insert new config
      const { data, error } = await supabase
        .from('billing_configs')
        .insert([configData])
        .select(returnColumns)
        .single();

      if (error) throw new Error(error.message);
      result = data;
    }

    return result;
  } catch (error) {
    throw new Error(`Error saving billing config: ${error.message}`);
  }
}

export async function getBillingConfig(companyId) {
  try {
    // Explicitly exclude cert_password - the client is not granted SELECT on that
    // column (see billing_configs RLS/grants); only the server-side SRI submission
    // function reads it, via the service role key which bypasses column privileges.
    const { data, error } = await supabase
      .from('billing_configs')
      .select('id, company_id, establishment, point_of_sale, sri_environment, sri_test_mode, current_sequential, accounting_regime, tax_rate, receipt_footer_text, auto_send_sri, store_phone, store_email, store_address, cert_storage_path, cert_uploaded_at')
      .eq('company_id', companyId)
      .single();

    if (error && error.code !== 'PGRST116') throw new Error(error.message);

    if (!data) {
      // Return default config if not found
      return {
        establishment: '001',
        pointOfSale: '001',
        environment: 'production',
        sriTestMode: true,
        currentSequential: 1,
        accountingRegime: 'general',
        taxRate: 12.00,
        certStoragePath: null,
        certUploadedAt: null
      };
    }

    return {
      establishment: data.establishment,
      pointOfSale: data.point_of_sale,
      environment: data.sri_environment,
      sriTestMode: data.sri_test_mode,
      currentSequential: data.current_sequential,
      accountingRegime: data.accounting_regime,
      taxRate: data.tax_rate,
      receiptFooterText: data.receipt_footer_text,
      autoSendSRI: data.auto_send_sri,
      phone: data.store_phone,
      email: data.store_email,
      address: data.store_address,
      certStoragePath: data.cert_storage_path,
      certUploadedAt: data.cert_uploaded_at
    };
  } catch (error) {
    throw new Error(`Error getting billing config: ${error.message}`);
  }
}

// Convierte un File a base64 sin depender de FileReader (evita el prefijo
// data: URL) - el archivo .p12 es chico (unos KB), el loop evita el límite de
// argumentos de String.fromCharCode(...bytes) que rompería con archivos más grandes.
async function fileToBase64(file) {
  const arrayBuffer = await file.arrayBuffer();
  const bytes = new Uint8Array(arrayBuffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

// La subida pasa por api/sri/upload-certificate.js (service_role) en vez de
// escribir directo a Supabase desde el navegador: la contraseña del .p12 se
// cifra server-side (pgcrypto) antes de guardarse, nunca viaja en claro a la
// tabla. Ver supabase/migrations/20260715_encrypt_cert_password.sql.
export async function uploadSriCertificate(file, certPassword) {
  try {
    if (!file || !certPassword) {
      throw new Error('Archivo de certificado y contraseña son requeridos');
    }

    const fileBase64 = await fileToBase64(file);

    const response = await fetch('/api/sri/upload-certificate', {
      method: 'POST',
      headers: await getAuthHeaders(),
      body: JSON.stringify({ certPassword, fileBase64 })
    });

    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Error al subir el certificado');

    return { certStoragePath: result.certStoragePath, certUploadedAt: result.certUploadedAt };
  } catch (error) {
    throw new Error(`Error uploading certificate: ${error.message}`);
  }
}

export async function uploadCompanyLogo(companyId, file) {
  try {
    if (!file) throw new Error('Selecciona una imagen para el logo');
    if (!file.type.startsWith('image/')) throw new Error('El archivo debe ser una imagen (PNG, JPG, SVG)');
    if (file.size > 2 * 1024 * 1024) throw new Error('La imagen no debe superar 2MB');

    const ext = file.name.split('.').pop().toLowerCase();
    const storagePath = `${companyId}/logo.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('company-logos')
      .upload(storagePath, file, { upsert: true, cacheControl: '3600' });

    if (uploadError) throw new Error(uploadError.message);

    const { data: urlData } = supabase.storage
      .from('company-logos')
      .getPublicUrl(storagePath);

    // Cache-bust so a replaced logo shows immediately instead of a stale
    // cached version at the same URL
    const logoUrl = `${urlData.publicUrl}?v=${Date.now()}`;

    const { error: updateError } = await supabase
      .from('companies')
      .update({ logo_url: logoUrl })
      .eq('id', companyId);

    if (updateError) throw new Error(updateError.message);

    return logoUrl;
  } catch (error) {
    throw new Error(`Error uploading logo: ${error.message}`);
  }
}

export async function getPaymentMethods() {
  try {
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('is_active', true)
      .order('sri_code', { ascending: true });

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching payment methods: ${error.message}`);
  }
}

// Feature flags: global catalog + per-company overrides (admin-only screens)
export async function fetchFeatureFlags() {
  const { data, error } = await supabase.from('feature_flags').select('*').order('category');
  if (error) throw new Error(error.message);
  return data || [];
}

export async function fetchCompanyFeatureOverrides(companyId) {
  const { data, error } = await supabase
    .from('company_feature_overrides')
    .select('*')
    .eq('company_id', companyId);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function setCompanyFeatureOverride({ companyId, featureKey, enabled, note, adminId }) {
  const { data, error } = await supabase
    .from('company_feature_overrides')
    .upsert(
      { company_id: companyId, feature_key: featureKey, enabled, note: note || null, updated_by: adminId, updated_at: new Date().toISOString() },
      { onConflict: 'company_id,feature_key' }
    )
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

export async function clearCompanyFeatureOverride(companyId, featureKey) {
  const { error } = await supabase
    .from('company_feature_overrides')
    .delete()
    .eq('company_id', companyId)
    .eq('feature_key', featureKey);

  if (error) throw new Error(error.message);
}

// Real payment ledger (replaces the session-local paymentHistory list)
export async function fetchPayments(companyId) {
  const { data, error } = await supabase
    .from('payments')
    .select('*')
    .eq('company_id', companyId)
    .order('payment_date', { ascending: false });

  if (error) throw new Error(error.message);
  return data || [];
}

// Global payment feed for the admin Pagos dashboard - across every company,
// not scoped to one (fetchPayments above is for a single company's detail).
export async function fetchAllPayments(limit = 100) {
  const { data, error } = await supabase
    .from('payments')
    .select('*, companies(nombre_comercial)')
    .order('payment_date', { ascending: false })
    .limit(limit);

  if (error) throw new Error(error.message);
  return data || [];
}

export async function createPaymentRecord({ companyId, amount, method, reference }) {
  const { data, error } = await supabase
    .from('payments')
    .insert([{
      company_id: companyId,
      amount,
      currency: 'USD',
      payment_method: method,
      reference: reference || null,
      status: 'pagado',
      payment_date: new Date().toISOString()
    }])
    .select()
    .single();

  if (error) throw new Error(error.message);
  return data;
}

// Finds the gerente login for a company - used by admin impersonation
// ("ver como cliente") to know which session to adopt.
export async function fetchCompanyGerente(companyId) {
  const { data, error } = await supabase
    .from('users')
    .select('id, company_id, email, name, phone, role, is_active, branch_id')
    .eq('company_id', companyId)
    .eq('role', 'gerente')
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (error) throw new Error(error.message);
  return data;
}

// Counts backing the onboarding checklist in CompanyDetail - one targeted
// query per count, only run for the single company being viewed.
export async function fetchOnboardingCounts(companyId) {
  const [branches, cashiers, invoices] = await Promise.all([
    supabase.from('branches').select('id, point_of_sales(id)').eq('company_id', companyId),
    supabase.from('users').select('id', { count: 'exact', head: true }).eq('company_id', companyId).in('role', ['operario', 'vendedor']),
    supabase.from('invoices').select('id', { count: 'exact', head: true }).eq('company_id', companyId).eq('status', 'autorizada')
  ]);

  const firstError = [branches, cashiers, invoices].find(r => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  const branchesWithPos = (branches.data || []).filter(b => (b.point_of_sales || []).length > 0).length;
  return {
    branchesWithPos,
    cashierCount: cashiers.count || 0,
    authorizedInvoiceCount: invoices.count || 0
  };
}

// Pulls everything company-scoped for the "export data" button in
// CompanyDetail - read-only, client-side download, no new storage involved.
// Compras Fase 5 de Mejoras Admin: se agregaron users (sin password_hash ni
// las columnas de bloqueo de cuenta - no son "datos de la empresa"),
// cash_closures, inventory_movements, payments, y el módulo de Compras
// completo (suppliers/purchases con sus hijos anidados, igual que invoices
// ya anida invoice_details). Es la base del flujo de baja definitiva: exigir
// este export antes de confirmar, ver CompanyDetail.jsx.
export async function fetchCompanyExportBundle(companyId) {
  const [products, customers, invoices, branches, users, cashClosures, inventoryMovements, payments, suppliers, purchases, accountsPayable] = await Promise.all([
    supabase.from('products').select('*').eq('company_id', companyId),
    supabase.from('customers').select('*').eq('company_id', companyId),
    supabase.from('invoices').select('*, invoice_details(*)').eq('company_id', companyId),
    supabase.from('branches').select('*, point_of_sales(*)').eq('company_id', companyId),
    supabase.from('users').select('id, email, name, phone, role, is_active, branch_id, last_login, created_at').eq('company_id', companyId),
    supabase.from('cash_closures').select('*').eq('company_id', companyId),
    supabase.from('inventory_movements').select('*').eq('company_id', companyId),
    supabase.from('payments').select('*').eq('company_id', companyId),
    supabase.from('suppliers').select('*').eq('company_id', companyId),
    supabase.from('purchases').select('*, purchase_details(*), purchase_retentions(*)').eq('company_id', companyId),
    supabase.from('accounts_payable').select('*, accounts_payable_payments(*)').eq('company_id', companyId)
  ]);

  const results = { products, customers, invoices, branches, users, cashClosures, inventoryMovements, payments, suppliers, purchases, accountsPayable };
  const firstError = Object.values(results).find(r => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    exportedAt: new Date().toISOString(),
    products: products.data || [],
    customers: customers.data || [],
    invoices: invoices.data || [],
    branches: branches.data || [],
    users: users.data || [],
    cashClosures: cashClosures.data || [],
    inventoryMovements: inventoryMovements.data || [],
    payments: payments.data || [],
    suppliers: suppliers.data || [],
    purchases: purchases.data || [],
    accountsPayable: accountsPayable.data || []
  };
}
