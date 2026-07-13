import { supabase } from './supabase.js';

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

export async function deleteCompany(id) {
  const { error } = await supabase
    .from('companies')
    .delete()
    .eq('id', id);

  if (error) throw new Error(`Error deleting company: ${error.message}`);
  return true;
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

  if (error) throw new Error(`Error creating POS: ${error.message}`);
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

  if (error) throw new Error(`Error creating branch: ${error.message}`);
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

export async function upsertProductStock({ productId, branchId, quantity, minStock }) {
  const { data, error } = await supabase
    .from('product_stock')
    .upsert([{
      product_id: productId,
      branch_id: branchId,
      quantity: parseInt(quantity) || 0,
      min_stock: parseInt(minStock) || 0,
      updated_at: new Date().toISOString()
    }], { onConflict: 'product_id,branch_id' })
    .select()
    .single();

  if (error) throw new Error(`Error updating stock: ${error.message}`);
  return data;
}

// Deducts sold quantity from a branch's stock at sale time (read-then-write,
// same pattern as getNextInvoiceSequential/getNextPosSequential - this app
// has no atomic counters anywhere, so this isn't a new risk class). Floors
// at 0 instead of going negative if stock was already short.
export async function decrementProductStock(productId, branchId, amount) {
  const { data: current, error: fetchError } = await supabase
    .from('product_stock')
    .select('quantity')
    .eq('product_id', productId)
    .eq('branch_id', branchId)
    .maybeSingle();

  if (fetchError) throw new Error(fetchError.message);

  const newQuantity = Math.max(0, (current?.quantity || 0) - amount);

  const { error } = await supabase
    .from('product_stock')
    .upsert([{ product_id: productId, branch_id: branchId, quantity: newQuantity, updated_at: new Date().toISOString() }], { onConflict: 'product_id,branch_id' });

  if (error) throw new Error(`Error updating stock: ${error.message}`);
  return newQuantity;
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

// User Authentication (from users table)
export async function validateAdminCredentials(email, password) {
  const { data, error } = await supabase.rpc('verify_user_password', {
    p_email: email,
    p_password: password
  });

  if (error || !data || data.length === 0) {
    throw new Error('Email o contraseña inválidos');
  }

  return {
    id: data[0].id,
    email: data[0].email,
    name: data[0].name,
    role: data[0].role,
    company_id: data[0].company_id
  };
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

export async function updateAdminLastLogin(email) {
  const { error } = await supabase
    .from('users')
    .update({ last_login: new Date().toISOString() })
    .eq('email', email);

  if (error) throw new Error(`Error updating last login: ${error.message}`);
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

// Creates an operario/vendedor login for the gerente's own company and emails
// them a welcome + temp password. Goes through the serverless endpoint
// (api/admin/create-cashier.js) instead of calling the RPC directly, so the
// plaintext password can be emailed server-side without ever living in the
// browser bundle. The endpoint verifies the caller is gerente/admin of the
// company and the RPC still re-validates the role server-side.
export async function createCashierUser({ callerId, companyId, email, password, name, role, phone, branchId }) {
  const response = await fetch('/api/admin/create-cashier', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ callerId, companyId, email, password, name, role, phone, branchId })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al crear el cajero');
  return result;
}

// Reassigns an existing cashier to a different branch (or unassigns with
// branchId=null). Scoped server-side to the target's own company and to
// cashier-level roles, same guard pattern as resetCashierPassword.
export async function updateUserBranch({ companyId, userId, branchId }) {
  const { data, error } = await supabase.rpc('update_user_branch', {
    p_company_id: companyId,
    p_user_id: userId,
    p_branch_id: branchId
  });

  if (error) throw new Error(error.message);
  return data?.[0];
}

// Creates the initial gerente login for a newly onboarded client company
<<<<<<< HEAD
// (admin-side, CompanyWizard) and emails them their temp password. Goes through
// api/admin/create-gerente.js, which verifies the caller is an admin before
// invoking the RPC with service role. The RPC's EXECUTE was revoked from
// anon/authenticated (see migration 20260711_email_notifications.sql), closing
// the §1.1.1 audit hole where anyone could self-provision a gerente login.
export async function createCompanyGerente({ adminId, companyId, email, password, name }) {
  const response = await fetch('/api/admin/create-gerente', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ adminId, companyId, email, password, name })
=======
// (admin-side, CompanyWizard) via the create_company_gerente RPC - same
// reason as createCashierUser: bcrypt hashing only happens inside Postgres.
export async function createCompanyGerente({ companyId, email, password, name, adminId }) {
  const { data, error } = await supabase.rpc('create_company_gerente', {
    p_company_id: companyId,
    p_email: email,
    p_password: password,
    p_name: name,
    p_admin_id: adminId
>>>>>>> a8b67df4aba83266168d9625ada638299e42d0cd
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al crear el gerente');
  return result;
}

// Emails the RIDE (PDF, generated in-browser with jsPDF as Base64) of an
// authorized invoice to the customer. The endpoint re-validates the invoice is
// 'autorizada' and pulls the recipient from the DB - the browser never chooses
// who receives it.
export async function emailInvoiceRide({ invoiceId, companyId, userId, pdfBase64 }) {
  const response = await fetch('/api/emails/send-invoice-ride', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, companyId, userId, pdfBase64 })
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || 'Error al enviar el RIDE por correo');
  return result;
}

// Lets a gerente set a new password for one of their cashiers directly -
// there's no outbound email/reset-link flow in this project (no Supabase
// Auth session, no SMTP configured), so this is the functional stand-in:
// the gerente sets it and relays it to the cashier themselves.
export async function resetCashierPassword({ companyId, userId, newPassword }) {
  const { data, error } = await supabase.rpc('reset_company_user_password', {
    p_company_id: companyId,
    p_user_id: userId,
    p_new_password: newPassword
  });

  if (error) throw new Error(error.message);
  return data?.[0];
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
    throw new Error(`Error creating product: ${error.message}`);
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
        issue_date: new Date().toISOString(),
        authorization_number: invoiceData.access_key || null,
        subtotal: parseFloat(invoiceData.subtotal_amount) || 0,
        discount_amount: parseFloat(invoiceData.discount_amount) || 0,
        tax_amount: parseFloat(invoiceData.tax_amount) || 0,
        total_amount: parseFloat(invoiceData.total_amount) || 0,
        payment_method: invoiceData.payment_method || 'cash',
        status: 'borrador',
        notes: invoiceData.notes || ''
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error creating invoice: ${error.message}`);
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

export async function submitInvoiceToSRI(invoiceId, companyId, userId) {
  const response = await fetch('/api/sri/submit-invoice', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ invoiceId, companyId, userId })
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
    error.stack_remote = result.stack;
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

export async function uploadSriCertificate(companyId, file, certPassword) {
  try {
    if (!file || !certPassword) {
      throw new Error('Archivo de certificado y contraseña son requeridos');
    }

    const { data: existing, error: findError } = await supabase
      .from('billing_configs')
      .select('id')
      .eq('company_id', companyId)
      .single();

    if (findError && findError.code !== 'PGRST116') throw new Error(findError.message);
    if (!existing) {
      throw new Error('Guarda la configuración de facturación antes de subir el certificado');
    }

    const storagePath = `${companyId}/certificado.p12`;

    const { error: uploadError } = await supabase.storage
      .from('sri-certificates')
      .upload(storagePath, file, { upsert: true });

    if (uploadError) throw new Error(uploadError.message);

    const uploadedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('billing_configs')
      .update({
        cert_storage_path: storagePath,
        cert_password: certPassword,
        cert_uploaded_at: uploadedAt
      })
      .eq('company_id', companyId);

    if (updateError) throw new Error(updateError.message);

    return { certStoragePath: storagePath, certUploadedAt: uploadedAt };
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
export async function fetchCompanyExportBundle(companyId) {
  const [products, customers, invoices, branches] = await Promise.all([
    supabase.from('products').select('*').eq('company_id', companyId),
    supabase.from('customers').select('*').eq('company_id', companyId),
    supabase.from('invoices').select('*, invoice_details(*)').eq('company_id', companyId),
    supabase.from('branches').select('*, point_of_sales(*)').eq('company_id', companyId)
  ]);

  const firstError = [products, customers, invoices, branches].find(r => r.error)?.error;
  if (firstError) throw new Error(firstError.message);

  return {
    exportedAt: new Date().toISOString(),
    products: products.data || [],
    customers: customers.data || [],
    invoices: invoices.data || [],
    branches: branches.data || []
  };
}
