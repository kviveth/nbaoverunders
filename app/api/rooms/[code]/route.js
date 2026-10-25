import { deleteRoom, readRoom } from '@/lib/rooms';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET(req, { params }) {
  const { code } = await params;
  try {
    const data = await readRoom(code, req.headers.get('x-token'));
    if (!data) return Response.json({ error: 'Room not found' }, { status: 404 });
    return Response.json(data, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function DELETE(req, { params }) {
  const { code } = await params;
  try {
    await deleteRoom(code, req.headers.get('x-token'));
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
