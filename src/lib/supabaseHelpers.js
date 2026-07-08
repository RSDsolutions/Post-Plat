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
