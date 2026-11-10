// Synthetic, intentionally vulnerable example. Never execute or deploy.
export function profile(req, res) {
  res.send('<h1>Hello ' + req.query.name + '</h1>');
}
