-- public.users pasa a ser la tabla de "perfil" sobre auth.users (patrón
-- estándar de Supabase), después de migrar los 7 usuarios existentes con
-- auth.admin.createUser({ id, password_hash, email_confirm:true }) - mismo
-- UUID y mismo hash bcrypt, cero reset de contraseñas ni reescritura de FKs
-- (invoices.user_id, activity_log.user_id, etc. ya apuntaban a estos ids).
alter table public.users
  add constraint users_id_fkey foreign key (id) references auth.users(id) on delete cascade;
