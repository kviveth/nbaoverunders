import { act } from '@/lib/rooms';
import { errorResponse } from '@/lib/http';

export async function POST(req, { params }) {
  const { code } = await params;
  try {
    return Response.json(await act(code, req.headers.get('x-token'), await req.json()));
  } catch (e) {
    return errorResponse(e);
  }
}
