import { getAdminOtpServer } from '../../../../../lib/server/admin-otp-server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  const server = getAdminOtpServer();
  return server.requestRoute(request);
}
