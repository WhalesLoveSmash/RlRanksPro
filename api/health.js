module.exports = (_, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).json({ ok: true, time: new Date().toISOString() });
};