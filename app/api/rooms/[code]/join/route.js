import { joinRoom } from '@/lib/rooms';
import { errorResponse } from '@/lib/http';

export async function POST(req, { params }) {
  const { code } = await params;
  try {
    return Response.json(await joinRoom(code, await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
