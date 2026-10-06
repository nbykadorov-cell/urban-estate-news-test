module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    message: "Urban Estate News API works",
    timestamp: new Date().toISOString()
  });
};
