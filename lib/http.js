import { ActionError } from './engine.js';

export function errorResponse(e) {
  if (e instanceof ActionError) return Response.json({ error: e.message }, { status: 400 });
  console.error(e);
  const error = e?.expose ? e.message : `Server error: ${e?.message || e}`;
  return Response.json({ error }, { status: 500 });
}
