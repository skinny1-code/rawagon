import { savings } from '@rawagon/fee-distributor';

// GET /api/savings?vol=50000&txMo=1000&visaRate=2.5
export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const vol = parseFloat(searchParams.get('vol') || '50000');
  const txMo = parseFloat(searchParams.get('txMo') || '1000');
  const visaRate = parseFloat(searchParams.get('visaRate') || '2.5');

  if (isNaN(vol) || vol <= 0) {
    return Response.json({ error: 'vol must be a positive number' }, { status: 400 });
  }

  const result = savings(vol, txMo, visaRate);
  return Response.json(result);
}
