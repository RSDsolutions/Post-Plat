-- El bucket sri-certificates ahora se escribe exclusivamente desde
-- api/sri/upload-certificate.js (service_role, que bypassa RLS de storage).
-- Estas políticas permitían a cualquiera con la anon key subir/reemplazar el
-- .p12 de cualquier empresa directamente vía Storage API, sin pasar por la
-- verificación de rol que sí tiene el nuevo endpoint.
drop policy if exists sri_certificates_upload on storage.objects;
drop policy if exists sri_certificates_replace on storage.objects;
