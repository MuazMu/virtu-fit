import { NextResponse } from 'next/server';

// Helper to wait for a given time
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.error("TRIPO_API_KEY environment variable is missing or empty.");
    return NextResponse.json({ error: 'Server configuration error: Missing Tripo API key' }, { status: 500 });
  }

  try {
    // Expect a JSON body with image_url
    const { image_url } = await req.json();
    if (!image_url || typeof image_url !== 'string' || !image_url.startsWith('data:image/')) {
      console.error("Invalid or missing image_url in request body.");
      return NextResponse.json({ error: 'Invalid image data provided.' }, { status: 400 });
    }

    // Convert data URL to Blob
    function dataURLtoBlob(dataurl: string) {
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) throw new Error('Invalid data URL');
      const mime = mimeMatch[1];
      const bstr = atob(arr[1]);
      const n = bstr.length;
      const u8arr = new Uint8Array(n);
      for (let i = 0; i < n; i++) {
        u8arr[i] = bstr.charCodeAt(i);
      }
      return new Blob([u8arr], { type: mime });
    }

    // Node.js doesn't have atob, so use Buffer
    function dataURLtoBuffer(dataurl: string) {
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) throw new Error('Invalid data URL');
      const mime = mimeMatch[1];
      const bstr = Buffer.from(arr[1], 'base64');
      return { buffer: bstr, mime };
    }

    // --- Step 1: Upload Image to Tripo ---
    const { buffer, mime } = dataURLtoBuffer(image_url);
    const ext = mime.split('/')[1];
    const formData = new FormData();
    formData.append('file', new Blob([buffer], { type: mime }), `upload.${ext}`);

    const uploadRes = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`
        // 'Content-Type' will be set automatically by FormData
      },
      body: formData as any,
    });
    const tripoTraceId = uploadRes.headers.get('X-Tripo-Trace-ID');
    console.log('[Tripo3D] Upload Response Status:', uploadRes.status, uploadRes.statusText, 'TraceID:', tripoTraceId);
    const uploadJson = await uploadRes.json();
    if (uploadJson.code !== 0) {
      console.error('[Tripo3D] Upload error:', uploadJson, 'TraceID:', tripoTraceId);
      return NextResponse.json({ error: uploadJson.message || 'Tripo upload failed', suggestion: uploadJson.suggestion, traceId: tripoTraceId }, { status: 500 });
    }
    const image_token = uploadJson.data.image_token;
    if (!image_token) {
      console.error('[Tripo3D] No image_token returned from upload', uploadJson, 'TraceID:', tripoTraceId);
      return NextResponse.json({ error: 'No image_token returned from Tripo upload', traceId: tripoTraceId }, { status: 500 });
    }
    console.log('[Tripo3D] Got image_token:', image_token, 'TraceID:', tripoTraceId);

    // --- Step 2: Create Image to Model Task ---
    const createTaskBody = {
      type: 'image_to_model',
      file: {
        type: ext,
        file_token: image_token
      }
      // You can add more options here if needed
    };
    const createTaskRes = await fetch('https://api.tripo3d.ai/v2/openapi/task', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createTaskBody),
    });
    const createTaskTraceId = createTaskRes.headers.get('X-Tripo-Trace-ID');
    console.log('[Tripo3D] Create Task Response Status:', createTaskRes.status, createTaskRes.statusText, 'TraceID:', createTaskTraceId);
    const createTaskJson = await createTaskRes.json();
    if (createTaskJson.code !== 0) {
      console.error('[Tripo3D] Create Task error:', createTaskJson, 'TraceID:', createTaskTraceId);
      return NextResponse.json({ error: createTaskJson.message || 'Tripo create task failed', suggestion: createTaskJson.suggestion, traceId: createTaskTraceId }, { status: 500 });
    }
    const taskId = createTaskJson.data.task_id;
    if (!taskId) {
      console.error('[Tripo3D] No task_id returned from create task', createTaskJson, 'TraceID:', createTaskTraceId);
      return NextResponse.json({ error: 'No task_id returned from Tripo create task', traceId: createTaskTraceId }, { status: 500 });
    }
    console.log('[Tripo3D] Created task_id:', taskId, 'TraceID:', createTaskTraceId);

    // --- Step 3: Poll for Task Completion ---
    const pollingInterval = 3000; // 3 seconds
    const pollingTimeout = 120000; // 2 minutes
    const startTime = Date.now();
    while (Date.now() - startTime < pollingTimeout) {
      await sleep(pollingInterval);
      const pollRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const pollTraceId = pollRes.headers.get('X-Tripo-Trace-ID');
      const pollJson = await pollRes.json();
      console.log('[Tripo3D] Polling task', taskId, 'status:', pollJson.data?.status, 'progress:', pollJson.data?.progress, 'TraceID:', pollTraceId);
      if (pollJson.code !== 0) {
        console.error('[Tripo3D] Polling error:', pollJson, 'TraceID:', pollTraceId);
        return NextResponse.json({ error: pollJson.message || 'Tripo polling failed', suggestion: pollJson.suggestion, traceId: pollTraceId }, { status: 500 });
      }
      if (pollJson.data.status === 'success') {
        const modelUrl = pollJson.data.output?.model;
        if (modelUrl) {
          console.log('[Tripo3D] Task succeeded, model URL:', modelUrl, 'TraceID:', pollTraceId);
          return NextResponse.json({ modelUrl, traceId: pollTraceId }, { status: 200 });
        } else {
          console.error('[Tripo3D] Task succeeded but no model URL found', pollJson, 'TraceID:', pollTraceId);
          return NextResponse.json({ error: 'Tripo task succeeded but no model URL found', traceId: pollTraceId }, { status: 500 });
        }
      } else if (['failed', 'cancelled', 'unknown', 'banned', 'expired'].includes(pollJson.data.status)) {
        console.error('[Tripo3D] Task failed or cancelled', pollJson, 'TraceID:', pollTraceId);
        return NextResponse.json({ error: `Tripo task failed: ${pollJson.data.status}`, traceId: pollTraceId }, { status: 500 });
      }
      // else: status is queued or running, continue polling
    }
    // Timeout
    console.error('[Tripo3D] Polling timed out for task', taskId);
    return NextResponse.json({ error: 'Tripo task did not complete in time' }, { status: 500 });
  } catch (error) {
    console.error('[Tripo3D] Unexpected Backend Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
} 