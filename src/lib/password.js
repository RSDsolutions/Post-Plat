// Temp-password generator shared by every admin-side flow that creates or
// resets a company user's login (wizard gerente/cajeros, CompanyUsersTab) -
// there's no outbound email/reset-link flow in this project, so the admin
// always sees the plaintext once and relays it to the client manually.
export function generateTempPassword() {
  return Math.random().toString(36).slice(-5) + Math.random().toString(36).slice(-5).toUpperCase();
}
