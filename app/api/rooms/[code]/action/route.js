import { act, ActionError } from '@/lib/rooms';

export async function POST(req, { params }) {
  const { code } = await params;
  try {
    return Response.json(await act(code, req.headers.get('x-token'), await req.json()));
  } catch (e) {
    if (!(e instanceof ActionError)) console.error(e);
    return Response.json({ error: e instanceof ActionError ? e.message : 'Something went wrong' }, { status: e instanceof ActionError ? 400 : 500 });
  }
}
