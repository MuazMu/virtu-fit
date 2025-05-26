export async function POST(req: Request) {
  const contentType = req.headers.get('content-type') || '';
  if (!contentType.includes('multipart/form-data')) {
    return new Response(JSON.stringify({ error: 'Invalid content type' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Use the new Web API for form data parsing in Next.js (Edge runtime)
  const formData = await req.formData();
  const file = formData.get('file');
  if (!file || typeof file === 'string') {
    return new Response(JSON.stringify({ error: 'No file uploaded' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // For now, just return the file name
  return new Response(
    JSON.stringify({ success: true, name: (file as File).name }),
    {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }
  );
} 