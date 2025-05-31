import { NextResponse } from 'next/server';

// Helper to wait for a given time
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function POST(req: Request) {
  const apiKey = process.env.MESHY_API_KEY;

  console.log("[Meshy3D] API Key present:", !!apiKey);

  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.error("MESHY_API_KEY environment variable is missing or empty.");
    return NextResponse.json({ error: 'Server configuration error: Missing Meshy API key' }, { status: 500 });
  }

  try {
    // Expect a JSON body with image_url
    const { image_url } = await req.json();

    // Validate the incoming image_url
    if (!image_url || typeof image_url !== 'string' || !image_url.startsWith('data:image/')) {
         console.error("Invalid or missing image_url in request body.");
         return NextResponse.json({ error: 'Invalid image data provided.' }, { status: 400 });
    }

    console.log("[Meshy3D] Backend: Received Data URI, attempting to create Meshy task...");
    console.log("[Meshy3D] image_url length:", image_url.length);

    // --- Step 1: Create Image to 3D Task ---
    const createTaskBody = {
      image_url: image_url,
      // Add optional parameters as needed
      // ai_model: 'meshy-5',
      // topology: 'quad',
      // should_remesh: true,
      // should_texture: true,
      // enable_pbr: false,
    };
    console.log("[Meshy3D] Sending createTaskBody to Meshy:", JSON.stringify(createTaskBody).slice(0, 500));

    const createTaskRes = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(createTaskBody),
    });

    console.log("[Meshy3D] Create Task Response Status:", createTaskRes.status, createTaskRes.statusText);
    console.log("[Meshy3D] Create Task Response Headers:", JSON.stringify(Object.fromEntries(createTaskRes.headers.entries())));

    let createTaskResText = await createTaskRes.clone().text();
    console.log("[Meshy3D] Create Task Response Body (first 500 chars):", createTaskResText.slice(0, 500));

    if (!createTaskRes.ok) {
      let errorDetails = `Meshy API failed with status ${createTaskRes.status}: ${createTaskRes.statusText}`;
      try {
          const errorJson = await createTaskRes.json();
          errorDetails = `Meshy API failed: ${errorJson?.message || JSON.stringify(errorJson)}`;
          console.error("[Meshy3D] Backend: Meshy API Create Task JSON Error:", createTaskRes.status, errorJson);
      } catch {
           const errorText = createTaskResText;
           errorDetails = `Meshy API failed: ${createTaskRes.status} ${createTaskRes.statusText} - ${errorText.substring(0, 200)}`;
           console.error("[Meshy3D] Backend: Meshy API Create Task Text Error:", createTaskRes.status, errorText);
      }
      return NextResponse.json({ error: `Failed to create Meshy task: ${errorDetails}` }, { status: createTaskRes.status });
    }

    const createTaskData = JSON.parse(createTaskResText);
    const taskId = createTaskData.result;
    console.log(`[Meshy3D] Backend: Meshy task created with ID: ${taskId}`);
    console.log("[Meshy3D] Full createTaskData:", JSON.stringify(createTaskData));

    if (!taskId) {
        console.error("[Meshy3D] Backend: Meshy API did not return a task ID in create response:", createTaskData);
        return NextResponse.json({ error: 'Meshy API did not return a task ID' }, { status: 500 });
    }

    // --- Step 2: Poll for Task Completion ---
    const pollingInterval = 3000; // Poll every 3 seconds
    const pollingTimeout = 120000; // Timeout after 120 seconds (2 minutes)
    const startTime = Date.now();

    console.log(`[Meshy3D] Backend: Starting polling for task ${taskId}...`);

    while (Date.now() - startTime < pollingTimeout) {
        await sleep(pollingInterval); // Wait before polling

        const getTaskRes = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        console.log(`[Meshy3D] Polling task ${taskId} - Status:`, getTaskRes.status, getTaskRes.statusText);
        let getTaskResText = await getTaskRes.clone().text();
        console.log(`[Meshy3D] Polling task ${taskId} - Response Body (first 500 chars):`, getTaskResText.slice(0, 500));

        if (!getTaskRes.ok) {
             let errorDetails = `Meshy API GET task status failed with status ${getTaskRes.status}: ${getTaskRes.statusText}`;
             try {
                 const errorJson = await getTaskRes.json();
                 errorDetails = `Meshy API GET task failed: ${errorJson?.message || JSON.stringify(errorJson)}`;
                 console.error("[Meshy3D] Backend: Meshy API GET Task JSON Error:", getTaskRes.status, errorJson);
             } catch {
                 const errorText = getTaskResText;
                 errorDetails = `Meshy API GET task failed: ${getTaskRes.status} ${getTaskRes.statusText} - ${errorText.substring(0, 200)}`;
                 console.error("[Meshy3D] Backend: Meshy API GET Task Text Error:", getTaskRes.status, errorText);
             }
             return NextResponse.json({ error: `Failed to get Meshy task status: ${errorDetails}` }, { status: getTaskRes.status });
        }

        const taskData = JSON.parse(getTaskResText);
        console.log(`[Meshy3D] Polling task ${taskId}, status: ${taskData.status}, progress: ${taskData.progress}`);
        console.log(`[Meshy3D] Full polling response:`, JSON.stringify(taskData));

        if (taskData.status === 'SUCCEEDED') {
            const modelUrl = taskData.model_urls?.glb;

            if (modelUrl) {
                console.log(`[Meshy3D] Backend: Task ${taskId} SUCCEEDED, GLB URL: ${modelUrl}`);
                return NextResponse.json({ modelUrl: modelUrl }, { status: 200 });
            } else {
                console.error("[Meshy3D] Backend: Meshy API SUCCEEDED but no GLB model URL found:", taskData);
                return NextResponse.json({ error: 'Meshy task succeeded but no GLB URL found' }, { status: 500 });
            }
        } else if (taskData.status === 'FAILED' || taskData.status === 'CANCELED') {
            console.error("[Meshy3D] Backend: Meshy API Task Failed:", taskData.task_error);
            return NextResponse.json({ error: `Meshy task failed: ${taskData.task_error?.message || taskData.status}` }, { status: 500 });
        }

        // Continue polling if status is PENDING or IN_PROGRESS
    }

    // If the loop times out
    console.error("[Meshy3D] Backend: Meshy API Polling timed out for task:", taskId);
    return NextResponse.json({ error: 'Meshy task did not complete in time' }, { status: 500 });


  } catch (error) {
    console.error("[Meshy3D] Unexpected Backend Error in /api/meshy-3d:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    console.error("[Meshy3D] Error details:", errorMessage, errorStack);

    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
} 