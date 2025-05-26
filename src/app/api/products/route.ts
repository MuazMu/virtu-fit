import { NextRequest } from 'next/server';

export async function GET(_req: NextRequest) {
  return new Response(
    JSON.stringify({
      products: [
        { id: '1', title: 'Jacket', image: '/mock-clothes/jacket.png', price: '$99.00' },
        { id: '2', title: 'Dress', image: '/mock-clothes/dress.png', price: '$79.00' },
        { id: '3', title: 'Tee', image: '/mock-clothes/tee.png', price: '$29.00' },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
} 