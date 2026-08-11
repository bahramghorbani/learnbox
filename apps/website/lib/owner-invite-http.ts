type OwnerInviteIssueDependencies = {
  issue(): Promise<{ code: string; expiresAt: Date }>;
};

const jsonHeaders = {
  'cache-control': 'no-store',
  'content-type': 'application/json; charset=utf-8',
};

export async function handleOwnerInviteIssue(
  request: Request,
  dependencies: OwnerInviteIssueDependencies,
): Promise<Response> {
  if (!isTrustedJsonPost(request)) {
    return Response.json({ error: 'request_rejected' }, { status: 403, headers: jsonHeaders });
  }

  try {
    const issued = await dependencies.issue();
    return Response.json(
      { code: issued.code, expiresAt: issued.expiresAt.toISOString() },
      { status: 201, headers: jsonHeaders },
    );
  } catch {
    return Response.json({ error: 'issue_unavailable' }, { status: 503, headers: jsonHeaders });
  }
}

function isTrustedJsonPost(request: Request): boolean {
  if (request.method !== 'POST') return false;
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) {
    return false;
  }
  const origin = request.headers.get('origin');
  if (!origin) return false;
  try {
    return new URL(origin).origin === new URL(request.url).origin;
  } catch {
    return false;
  }
}
