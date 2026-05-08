import pkg from "pg";
import { databaseConfig } from "./appConfig.js";

const { Pool } = pkg;

const pool = new Pool({
  connectionString: databaseConfig.connectionString,
  max: parseInt(process.env.PG_POOL_MAX, 10) || 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
  ssl: databaseConfig.ssl,
});

export default pool;
