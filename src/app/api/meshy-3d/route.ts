import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  const apiKey = process.env.MESHY_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: 'Missing Meshy API key' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    // --- Implement actual call to Meshy.ai API here ---
    // Consult Meshy.ai API documentation for the correct endpoint and parameters.
    // Example endpoint: https://api.meshy.ai/v1/image-to-3d

    const meshyFormData = new FormData();
    meshyFormData.append('image_file', file); // Meshy API might expect 'image_file' or similar
    // Add other required Meshy parameters here based on their docs, e.g.:
    // meshyFormData.append('mode', 'normal');
    // meshyFormData.append('texture_size', '1k');

    const meshyApiRes = await fetch('https://api.meshy.ai/v1/image-to-3d', { // **VERIFY THIS ENDPOINT IN MESHY DOCS**
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        // Do NOT set 'Content-Type': 'multipart/form-data' here, fetch does it automatically with FormData
      },
      body: meshyFormData,
    });

    if (!meshyApiRes.ok) {
      const errorText = await meshyApiRes.text();
      console.error("Meshy API Error:", meshyApiRes.status, errorText);
      return NextResponse.json({ error: `Meshy API failed: ${meshyApiRes.status} ${meshyApiRes.statusText}` }, { status: meshyApiRes.status });
    }

    const meshyData = await meshyApiRes.json();

    // --- Extract the actual model URL from Meshy's response ---
    // The field name might be different based on Meshy.ai's API documentation.
    const modelUrl = meshyData.model_url || meshyData.url || meshyData.result_url; // **VERIFY THIS FIELD IN MESHY DOCS**

    if (!modelUrl) {
        console.error("Meshy API did not return a model URL:", meshyData);
        return NextResponse.json({ error: 'Meshy API did not return a model URL' }, { status: 500 });
    }

    // Meshy might provide an initial response quickly, then process async
    // You might need to poll their API for the final model URL if it's not in the initial response
    // For simplicity, this example assumes the URL is in the immediate response.
    // Consult Meshy docs for async workflows.

    return NextResponse.json({ modelUrl: modelUrl }, { status: 200 });

  } catch (error) {
    console.error("Backend Error processing Meshy request:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 