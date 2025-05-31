export async function GET() {
  // Static mock product list with provided clothing images
  const products = [
    {
      id: '1',
      title: 'Cartoon Graphic T-Shirt',
      image: '/mock-clothes/tshirt1.jpg',
      price: '$19.99',
    },
    {
      id: '2',
      title: 'Blue Patterned Shirt',
      image: '/mock-clothes/shirt1.jpg',
      price: '$24.99',
    },
    {
      id: '3',
      title: 'Classic Black Pants',
      image: '/mock-clothes/pants1.jpg',
      price: '$29.99',
    },
    {
      id: '4',
      title: 'Casual Brown Chinos',
      image: '/mock-clothes/pants2.jpg',
      price: '$27.99',
    },
  ];
  return new Response(JSON.stringify({ products }), { status: 200 });
} 