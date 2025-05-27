import { NextResponse } from 'next/server';

// Helper to convert File to Base64 Data URI
async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target?.result as string);
    reader.onerror = (e) => reject(e);
    reader.readAsDataURL(file);
  });
}

// Helper to wait for a given time
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

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

    // Convert the file to a Data URI
    const imageDataUri = await fileToDataUri(file);

    // --- Step 1: Create Image to 3D Task ---
    const createTaskRes = await fetch('https://api.meshy.ai/openapi/v1/image-to-3d', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        image_url: imageDataUri, // Send as Data URI
        // Add optional parameters as needed, e.g.:
        // ai_model: 'meshy-5',
        // topology: 'quad',
        // should_remesh: true,
        // should_texture: true, // Default is true
        // enable_pbr: false, // Default is false
      }),
    });

    if (!createTaskRes.ok) {
      const errorData = await createTaskRes.json(); // Meshy returns JSON errors
      console.error("Meshy API Create Task Error:", createTaskRes.status, errorData);
      return NextResponse.json({ error: `Failed to create Meshy task: ${errorData?.message || createTaskRes.statusText}` }, { status: createTaskRes.status });
    }

    const createTaskData = await createTaskRes.json();
    const taskId = createTaskData.result;

    if (!taskId) {
        console.error("Meshy API did not return a task ID:", createTaskData);
        return NextResponse.json({ error: 'Meshy API did not return a task ID' }, { status: 500 });
    }

    // --- Step 2: Poll for Task Completion ---
    const pollingInterval = 3000; // Poll every 3 seconds
    const pollingTimeout = 120000; // Timeout after 120 seconds (2 minutes)
    const startTime = Date.now();

    while (Date.now() - startTime < pollingTimeout) {
        await sleep(pollingInterval); // Wait before polling

        const getTaskRes = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!getTaskRes.ok) {
             const errorData = await getTaskRes.json();
             console.error("Meshy API Get Task Error:", getTaskRes.status, errorData);
             // If task not found or other errors, break polling
             return NextResponse.json({ error: `Failed to get Meshy task status: ${errorData?.message || getTaskRes.statusText}` }, { status: getTaskRes.status });
        }

        const taskData = await getTaskRes.json();
        console.log(`Polling task ${taskId}, status: ${taskData.status}, progress: ${taskData.progress}`);


        if (taskData.status === 'SUCCEEDED') {
            const modelUrl = taskData.model_urls?.glb;

            if (modelUrl) {
                return NextResponse.json({ modelUrl: modelUrl }, { status: 200 });
            } else {
                console.error("Meshy API SUCCEEDED but no GLB model URL found:", taskData);
                return NextResponse.json({ error: 'Meshy task succeeded but no GLB URL found' }, { status: 500 });
            }
        } else if (taskData.status === 'FAILED' || taskData.status === 'CANCELED') {
            console.error("Meshy API Task Failed:", taskData.task_error);
            return NextResponse.json({ error: `Meshy task failed: ${taskData.task_error?.message || taskData.status}` }, { status: 500 });
        }

        // Continue polling if status is PENDING or IN_PROGRESS
    }

    // If the loop times out
    console.error("Meshy API Polling timed out for task:", taskId);
    return NextResponse.json({ error: 'Meshy task did not complete in time' }, { status: 500 });


  } catch (error) {
    console.error("Backend Error processing Meshy request:", error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
} 