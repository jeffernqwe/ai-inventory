/**
 * 404 handler for unknown routes. Returns a consistent JSON shape.
 */
const notFound = (req, res) => {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.originalUrl} not found`,
  });
};

export default notFound;
