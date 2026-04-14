import { pawn } from '@rawagon/gold-oracle';

// GET /api/pawn?metal=gold&grams=10&karat=14&ltv=0.6&buy=0.85
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const metal = searchParams.get('metal') || 'gold';
  const grams = parseFloat(searchParams.get('grams') || '10');
  const karat = parseFloat(searchParams.get('karat') || '14');
  const ltv = parseFloat(searchParams.get('ltv') || '0.6');
  const buy = parseFloat(searchParams.get('buy') || '0.85');

  if (!['gold', 'silver'].includes(metal)) {
    return Response.json({ error: 'metal must be gold or silver' }, { status: 400 });
  }

  try {
    const result = await pawn(metal, grams, karat, ltv, buy);
    return Response.json(result);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
