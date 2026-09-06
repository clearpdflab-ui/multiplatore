export const config = {
  port: process.env.PORT || 8080,
  nodeEnv: process.env.NODE_ENV || 'development',
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
  },
  jwt: {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-me',
    expiresIn: '7d',
  },
  database: {
    path: process.env.DB_PATH || './multiplatore.db',
  },
  odds: {
    apiKey: process.env.THE_ODDS_API_KEY || '',
    baseUrl: 'https://the-odds-api.com/v4',
    refreshInterval: 60000,
  },
};
