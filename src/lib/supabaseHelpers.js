import { supabase } from './supabase.js';

// Companies
export async function fetchCompanies() {
  const { data, error } = await supabase
    .from('companies')
    .select('*')
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
    .select('*');

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
export async function createProduct(productData) {
  try {
    const { data, error } = await supabase
      .from('products')
      .insert([{
        code: productData.code,
        name: productData.name,
        category: productData.category,
        company_id: productData.company_id,
        quantity: parseInt(productData.quantity) || 0,
        min_stock: parseInt(productData.minStock) || 10,
        sale_price: parseFloat(productData.salePrice),
        price_includes_vat: productData.priceIncludesVat !== false,
        discount: parseFloat(productData.discount) || 0,
        promotion: productData.promotion || '',
        created_at: new Date().toISOString()
      }])
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error creating product: ${error.message}`);
  }
}

export async function updateProduct(productId, updates) {
  try {
    const updateData = {
      ...updates,
      quantity: updates.quantity ? parseInt(updates.quantity) : undefined,
      min_stock: updates.minStock ? parseInt(updates.minStock) : undefined,
      sale_price: updates.salePrice ? parseFloat(updates.salePrice) : undefined,
      discount: updates.discount !== undefined ? parseFloat(updates.discount) : undefined,
      promotion: updates.promotion !== undefined ? updates.promotion : undefined,
      price_includes_vat: updates.priceIncludesVat !== undefined ? updates.priceIncludesVat : undefined
    };

    // Remove undefined values
    Object.keys(updateData).forEach(key => updateData[key] === undefined && delete updateData[key]);

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

// Invoices & Billing
export async function createInvoice(invoiceData) {
  try {
    const { data, error } = await supabase
      .from('invoices')
      .insert([{
        company_id: invoiceData.company_id,
        user_id: invoiceData.user_id,
        invoice_number: invoiceData.invoice_number,
        sequential: invoiceData.sequential,
        establishment: invoiceData.establishment,
        point_of_sale: invoiceData.point_of_sale,
        issue_date: new Date().toISOString(),
        subtotal_amount: parseFloat(invoiceData.subtotal_amount),
        discount_amount: parseFloat(invoiceData.discount_amount) || 0,
        taxable_amount: parseFloat(invoiceData.taxable_amount),
        tax_amount: parseFloat(invoiceData.tax_amount),
        total_amount: parseFloat(invoiceData.total_amount),
        tax_rate: parseFloat(invoiceData.tax_rate) || 12,
        payment_method: invoiceData.payment_method,
        customer_id: invoiceData.customer_id || null,
        customer_name: invoiceData.customer_name || '',
        customer_email: invoiceData.customer_email || '',
        customer_phone: invoiceData.customer_phone || '',
        status: 'pending',
        sri_status: 'pending',
        transaction_id: invoiceData.transaction_id,
        reference: invoiceData.reference || '',
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
        quantity: parseInt(detailData.quantity),
        unit_price: parseFloat(detailData.unit_price),
        discount_percent: parseFloat(detailData.discount_percent) || 0,
        discount_amount: parseFloat(detailData.discount_amount) || 0,
        subtotal: parseFloat(detailData.subtotal),
        tax_rate: parseFloat(detailData.tax_rate) || 12,
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
      .select('*')
      .eq('company_id', companyId)
      .order('issue_date', { ascending: false });

    if (error) throw new Error(error.message);
    return data || [];
  } catch (error) {
    throw new Error(`Error fetching invoices: ${error.message}`);
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

export async function updateInvoiceStatus(invoiceId, status, sriStatus = null) {
  try {
    const updateData = { status };
    if (sriStatus) updateData.sri_status = sriStatus;

    const { data, error } = await supabase
      .from('invoices')
      .update(updateData)
      .eq('id', invoiceId)
      .select()
      .single();

    if (error) throw new Error(error.message);
    return data;
  } catch (error) {
    throw new Error(`Error updating invoice status: ${error.message}`);
  }
}

export async function getNextInvoiceSequential(companyId) {
  try {
    // Get the last sequential number for this company
    const { data, error } = await supabase
      .from('invoices')
      .select('sequential')
      .eq('company_id', companyId)
      .order('sequential', { ascending: false })
      .limit(1);

    if (error && error.code !== 'PGRST116') throw new Error(error.message);

    const lastSequential = data && data.length > 0 ? data[0].sequential : 0;
    return lastSequential + 1;
  } catch (error) {
    throw new Error(`Error getting next sequential: ${error.message}`);
  }
}

export async function saveBillingConfig(companyId, config) {
  try {
    // This would be stored in a billing_config table
    // For now, we'll use localStorage as a temporary solution
    localStorage.setItem(
      `billing_config_${companyId}`,
      JSON.stringify(config)
    );
    return config;
  } catch (error) {
    throw new Error(`Error saving billing config: ${error.message}`);
  }
}

export async function getBillingConfig(companyId) {
  try {
    const config = localStorage.getItem(`billing_config_${companyId}`);
    return config ? JSON.parse(config) : null;
  } catch (error) {
    throw new Error(`Error getting billing config: ${error.message}`);
  }
}
