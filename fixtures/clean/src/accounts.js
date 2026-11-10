// Safer synthetic control. No database or server is started.
export function findAccount(req, db) {
  return db.query('SELECT * FROM accounts WHERE email = ?', [req.query.email]);
}
