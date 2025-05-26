export async function POST(req: Request) {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing Meshy API key' }), { status: 500 });
  }
  try {
    const formData = await req.formData();
    const file = formData.get('file');
    if (!file || typeof file === 'string') {
      return new Response(JSON.stringify({ error: 'No file uploaded' }), { status: 400 });
    }
    // Prepare form data for Meshy
    const meshForm = new FormData();
    meshForm.append('file', file);
    // You may need to add other fields per Meshy API docs
    // Example endpoint: https://api.meshy.ai/v1/image-to-3d
    const res = await fetch('https://api.meshy.ai/v1/image-to-3d', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // 'Content-Type' should NOT be set when sending FormData
      },
      body: meshForm,
    });
    if (!res.ok) {
      const error = await res.text();
      return new Response(JSON.stringify({ error }), { status: res.status });
    }
    const data = await res.json();
    // Assume the response contains a model URL or file info
    return new Response(JSON.stringify({ modelUrl: data.modelUrl || data.url || data }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to connect to Meshy API' }), { status: 500 });
  }
} 