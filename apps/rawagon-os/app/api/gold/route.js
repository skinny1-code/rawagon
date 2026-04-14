import { gold } from '@rawagon/gold-oracle';

export async function GET() {
  try {
    const data = await gold();
    return Response.json(data);
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
