type OwnerInviteIssueDependencies = {
  issue(): Promise<{ code: string; expiresAt: Date }>;
  reportIssue?(diagnostic: OwnerInviteIssueDiagnostic): void;
};

type OwnerInviteIssueDiagnostic = {
  code: string;
  name: string;
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
  } catch (error) {
    (dependencies.reportIssue ?? reportOwnerInviteIssue)(sanitizeIssueError(error));
    return Response.json({ error: 'issue_unavailable' }, { status: 503, headers: jsonHeaders });
  }
}

function sanitizeIssueError(error: unknown): OwnerInviteIssueDiagnostic {
  const rawCode =
    error !== null && typeof error === 'object' && 'code' in error ? error.code : undefined;
  const code =
    typeof rawCode === 'string' && /^[A-Z0-9_]{1,32}$/.test(rawCode) ? rawCode : 'unknown';
  const name =
    error instanceof Error && /^[A-Za-z][A-Za-z0-9]*$/.test(error.name)
      ? error.name
      : 'UnknownError';
  return { code, name };
}

function reportOwnerInviteIssue(diagnostic: OwnerInviteIssueDiagnostic): void {
  console.error('owner_invite_issue_failed', diagnostic);
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
