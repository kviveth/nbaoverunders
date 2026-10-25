import { createRoom, ActionError } from '@/lib/rooms';

export async function POST(req) {
  try {
    const body = await req.json();
    return Response.json(await createRoom(body));
  } catch (e) {
    return Response.json({ error: e instanceof ActionError ? e.message : 'Something went wrong' }, { status: e instanceof ActionError ? 400 : 500 });
  }
}
