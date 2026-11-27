import { authenticateLearner } from '../../../../../lib/learner-auth';
import { guardMutation } from '../../../../../lib/mutation-guard';
import { learnerSupportTicketsDependenciesFromEnvironment } from '../../../../../lib/support-tickets-web-runtime';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const cacheHeaders = {
  'Content-Type': 'application/json',
  'Cache-Control': 'private, no-store',
  'X-Content-Type-Options': 'nosniff',
};
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: cacheHeaders });
}

function unavailable() {
  return json({ code: 'support_unavailable' }, 503);
}

function parseTicket(input: unknown): { subject: string; message: string } | undefined {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return undefined;
  const record = input as Record<string, unknown>;
  if (Object.keys(record).some((key) => key !== 'subject' && key !== 'message')) return undefined;
  const { subject, message } = record;
  if (typeof subject !== 'string' || typeof message !== 'string') return undefined;
  const normalizedSubject = subject.trim();
  const normalizedMessage = message.trim();
  if (
    normalizedSubject.length < 3 ||
    normalizedSubject.length > 120 ||
    normalizedMessage.length < 3 ||
    normalizedMessage.length > 3000
  ) {
    return undefined;
  }
  return { subject: normalizedSubject, message: normalizedMessage };
}

export async function GET(request: Request) {
  const session = await authenticateLearner(request);
  if (!session) return json({ code: 'unauthorized' }, 401);
  const dependencies = learnerSupportTicketsDependenciesFromEnvironment();
  if (!dependencies) return unavailable();
  try {
    return json({ tickets: await dependencies.listTickets(session.subject) });
  } catch {
    return unavailable();
  }
}

export async function POST(request: Request) {
  // Must precede auth/body/DB work: hostile origins cannot use this endpoint as an account oracle.
  const rejected = guardMutation(request, { method: 'POST' });
  if (rejected) return rejected;
  const session = await authenticateLearner(request);
  if (!session) return json({ code: 'unauthorized' }, 401);
  const dependencies = learnerSupportTicketsDependenciesFromEnvironment();
  if (!dependencies) return unavailable();
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ code: 'invalid_ticket' }, 400);
  }
  const ticket = parseTicket(body);
  if (!ticket) return json({ code: 'invalid_ticket' }, 400);
  const requestId = request.headers.get('idempotency-key')?.trim() ?? '';
  if (!uuidPattern.test(requestId)) return json({ code: 'invalid_ticket' }, 400);
  try {
    return json(
      {
        ticket: await dependencies.createTicket({ userId: session.subject, requestId, ...ticket }),
      },
      201,
    );
  } catch {
    return unavailable();
  }
}
