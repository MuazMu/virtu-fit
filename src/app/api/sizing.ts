export async function POST(req: Request) {
  const { height, weight } = await req.json();
  let size = 'M';
  if (height < 160 || weight < 55) size = 'S';
  else if (height > 185 || weight > 90) size = 'XL';
  else if (height > 175 || weight > 80) size = 'L';
  return new Response(
    JSON.stringify({ size, height, weight }),
    { status: 200, headers: { 'Content-Type': 'application/json' } }
  );
} 