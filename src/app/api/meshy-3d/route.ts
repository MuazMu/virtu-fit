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
    // Accept either image_url (start new) or taskId (poll existing)
    const body = await req.json();
    const { image_url, taskId } = body;

    let task_id = taskId;
    let ext = undefined;
    let lastPollTraceId = undefined;

    if (!task_id) {
      // No taskId: start new task from image_url
      if (!image_url || typeof image_url !== 'string' || !image_url.startsWith('data:image/')) {
        console.error("Invalid or missing image_url in request body.");
        return NextResponse.json({ error: 'Invalid image data provided.' }, { status: 400 });
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
      ext = mime.split('/')[1];
      const formData = new FormData();
      formData.append('file', new Blob([buffer], { type: mime }), `upload.${ext}`);

      const uploadRes = await fetch('https://api.tripo3d.ai/v2/openapi/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        },
        body: formData,
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
      task_id = createTaskJson.data.task_id;
      if (!task_id) {
        console.error('[Tripo3D] No task_id returned from create task', createTaskJson, 'TraceID:', createTaskTraceId);
        return NextResponse.json({ error: 'No task_id returned from Tripo create task', traceId: createTaskTraceId }, { status: 500 });
      }
      console.log('[Tripo3D] Created task_id:', task_id, 'TraceID:', createTaskTraceId);
    }

    // --- Step 3: Poll for Task Completion (or status) ---
    const pollingInterval = 2000; // 2 seconds
    const pollingTimeout = 55000; // 55 seconds (Vercel limit)
    const startTime = Date.now();
    let firstPoll = true;
    while (firstPoll || (!taskId && Date.now() - startTime < pollingTimeout)) {
      firstPoll = false;
      await sleep(pollingInterval);
      const pollRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${task_id}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const pollTraceId = pollRes.headers.get('X-Tripo-Trace-ID');
      lastPollTraceId = pollTraceId;
      const pollJson = await pollRes.json();
      console.log('[Tripo3D] Polling task', task_id, 'status:', pollJson.data?.status, 'progress:', pollJson.data?.progress, 'TraceID:', pollTraceId);
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
      if (taskId) break; // If polling by taskId, only poll once
    }
    // Timeout: still processing
    console.error('[Tripo3D] Polling timed out for task', task_id);
    return NextResponse.json({ status: 'processing', taskId: task_id, traceId: lastPollTraceId }, { status: 202 });
  } catch (error) {
    console.error('[Tripo3D] Unexpected Backend Error:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
} 