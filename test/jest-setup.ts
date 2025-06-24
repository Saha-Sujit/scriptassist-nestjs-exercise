// jest-setup.ts
// This file is executed before running tests

// Mock environment variables for test environment
process.env.NODE_ENV = 'test';
process.env.PORT = '3001'; // Optional: use a separate test port

// JWT config
process.env.JWT_SECRET = 'test-abcdefghLoremipsum';
process.env.JWT_EXPIRATION = '1d';

// PostgreSQL test DB
process.env.DB_HOST = 'localhost';
process.env.DB_PORT = '5432';
process.env.DB_USERNAME = 'postgres';
process.env.DB_PASSWORD = 'root';
process.env.DB_DATABASE = 'taskflow_test';
