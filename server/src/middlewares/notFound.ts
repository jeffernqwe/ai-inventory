import type { Request, Response } from 'express';

/**
 * 404 handler for unknown routes. Returns a consistent JSON shape.
 */
const notFound = (req: Request, res: Response) => {
  res.status(404).json({
    error: 'Not Found',
    message: `${req.method} ${req.originalUrl} not found`,
  });
};

export default notFound;
