import { gasPrice } from '@rawagon/fee-distributor';

export async function GET() {
  try {
    const gwei = await gasPrice();
    return Response.json({ gwei });
  } catch (err) {
    return Response.json({ error: err.message }, { status: 502 });
  }
}
