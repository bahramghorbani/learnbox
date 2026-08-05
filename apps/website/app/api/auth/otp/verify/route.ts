import { handleOtpVerification } from '../../../../../lib/otp-http';
import { otpHttpDependenciesFromEnvironment } from '../../../../../lib/otp-runtime';

export const runtime = 'nodejs';

export async function POST(request: Request): Promise<Response> {
  const dependencies = otpHttpDependenciesFromEnvironment();
  if (!dependencies) {
    return Response.json(
      { error: 'otp_unavailable' },
      { status: 503, headers: { 'cache-control': 'no-store' } },
    );
  }
  return handleOtpVerification(request, dependencies);
}
