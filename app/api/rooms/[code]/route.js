import { readRoom } from '@/lib/rooms';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { code } = await params;
  const data = await readRoom(code, req.headers.get('x-token'));
  if (!data) return Response.json({ error: 'Room not found' }, { status: 404 });
  return Response.json(data, { headers: { 'cache-control': 'no-store' } });
}
