import { AllCard } from '@rawagon/allcard-sdk';

// POST /api/pan  { key?: string }  → { pan, nonce, key }
// Omit key to generate a fresh card; provide key to shift an existing one.
export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const card = body.key ? new AllCard(body.key) : AllCard.create();
    const { pan, nonce } = card.shift();
    return Response.json({ pan, nonce, key: card.key });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 400 });
  }
}
