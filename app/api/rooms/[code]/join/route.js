import { joinRoom, ActionError } from '@/lib/rooms';

export async function POST(req, { params }) {
  const { code } = await params;
  try {
    return Response.json(await joinRoom(code, await req.json()));
  } catch (e) {
    return Response.json({ error: e instanceof ActionError ? e.message : 'Something went wrong' }, { status: e instanceof ActionError ? 400 : 500 });
  }
}
