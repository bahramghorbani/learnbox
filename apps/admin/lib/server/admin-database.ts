export type AdminDatabaseConfig = {
  connectionString: string;
  max: 4;
};

type Environment = Record<string, string | undefined>;

export function requireAdminDatabaseTls(databaseUrl: string) {
  const parsed = new URL(databaseUrl);
  parsed.searchParams.set('sslmode', 'verify-full');
  return parsed.toString();
}

export function readAdminDatabaseConfig(environment: Environment): AdminDatabaseConfig {
  const databaseUrl = environment.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required for admin persistence.');
  return { connectionString: requireAdminDatabaseTls(databaseUrl), max: 4 };
}
