import { NextRequest } from 'next/server';

export async function POST(req: NextRequest) {
  // You can add file handling logic here later
  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
} 