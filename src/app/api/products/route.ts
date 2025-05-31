export async function GET() {
  return new Response(
    JSON.stringify({
      products: [
        { id: '1', title: 'Pants 2', image: '/mock-clothes/pants2.jpg', price: '$99.00' },
        { id: '2', title: 'Pants 1', image: '/mock-clothes/pants1.jpg', price: '$79.00' },
        { id: '3', title: 'Shirt 1', image: '/mock-clothes/shirt1.jpg', price: '$29.00' },
        { id: '4', title: 'T-shirt 1', image: '/mock-clothes/tshirt1.jpg', price: '$19.00' },
      ],
    }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
} 