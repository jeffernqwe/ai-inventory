const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT) || 4000,
  // MongoDB connection string. Never log or expose this value.
  mongodbUri: process.env.MONGODB_URI || '',
  // JWT signing secret. Never log, commit, or expose this value.
  jwtSecret: process.env.JWT_SECRET || '',
  // Access-token lifetime (jsonwebtoken format, e.g. "7d", "15m").
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
};

export default env;
