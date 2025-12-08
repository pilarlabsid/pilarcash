// Database Configuration
const config = {
  development: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres', // Default PostgreSQL password
    database: process.env.DB_NAME || 'pravacash',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  },
  test: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres', // Default PostgreSQL password
    database: process.env.DB_NAME || 'pravacash_test',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  },
  production: {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'pravacash',
    port: process.env.DB_PORT || 5432,
    dialect: 'postgres',
    logging: false
  }
};

module.exports = config;

