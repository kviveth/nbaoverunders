import { createRoom } from '@/lib/rooms';
import { errorResponse } from '@/lib/http';

export async function POST(req) {
  try {
    return Response.json(await createRoom(await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
