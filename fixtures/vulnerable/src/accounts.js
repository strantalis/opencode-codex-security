// Synthetic, intentionally vulnerable example. Never execute or deploy.
export function findAccount(req, db) {
  return db.query("SELECT * FROM accounts WHERE email = '" + req.query.email + "'");
}
