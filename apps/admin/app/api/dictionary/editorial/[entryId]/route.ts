import { getAdminDictionaryEditorialServer } from '../../../../../lib/server/admin-dictionary-editorial-server';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export async function PATCH(request: Request, { params }: { params: Promise<{ entryId: string }> }) { const server = getAdminDictionaryEditorialServer(); if (!server.enabled) return new Response('Not found', { status: 404 }); return server.update(request, (await params).entryId); }
