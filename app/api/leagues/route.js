import { listRooms } from '@/lib/rooms';
import { errorResponse } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    return Response.json({ leagues: await listRooms() }, { headers: { 'cache-control': 'no-store' } });
  } catch (e) {
    return errorResponse(e);
  }
}
