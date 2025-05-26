export async function POST() {
  // You can add Meshy 3D API integration here later
  return new Response(JSON.stringify({ modelUrl: 'https://example.com/mock-model.glb' }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} 