-- password_hash queda como dato histórico inerte (ver 20260715_link_users_to_auth.sql):
-- ya no es la fuente de verdad de credenciales, Auth lo es. Los endpoints
-- nuevos (create-gerente.js, create-cashier.js) no la llenan más - hace falta
-- quitar el NOT NULL para que el insert del perfil no falle.
alter table public.users alter column password_hash drop not null;
