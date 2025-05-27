import { NextResponse } from 'next/server';

// Helper to convert File to Base64 Data URI
async function fileToDataUri(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (e.target?.result) {
        resolve(e.target.result as string);
      } else {
        reject(new Error("Failed to read file as Data URL."));
      }
    };
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

  // Explicitly check if apiKey is a non-empty string
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    console.error("MESHY_API_KEY environment variable is missing or empty.");
    return NextResponse.json({ error: 'Server configuration error: Missing Meshy API key' }, { status: 500 });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file');

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }

    console.log(`Received file: ${file.name}, size: ${file.size} bytes`);

    // Convert the file to a Data URI
    let imageDataUri: string;
    try {
        imageDataUri = await fileToDataUri(file);
        console.log("File converted to Data URI.");
    } catch (fileError) {
        console.error("Error converting file to Data URI:", fileError);
        return NextResponse.json({ error: 'Failed to process uploaded image.' }, { status: 500 });
    }


    // --- Step 1: Create Image to 3D Task ---
    console.log("Attempting to create Meshy task...");
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
      // Try to read error as JSON first, fallback to text
      let errorDetails = `Meshy API failed with status ${createTaskRes.status}: ${createTaskRes.statusText}`;
      try {
          const errorJson = await createTaskRes.json();
          errorDetails = `Meshy API failed: ${errorJson?.message || JSON.stringify(errorJson)}`;
          console.error("Meshy API Create Task JSON Error:", createTaskRes.status, errorJson);
      } catch {
           const errorText = await createTaskRes.text();
           errorDetails = `Meshy API failed: ${createTaskRes.status} ${createTaskRes.statusText} - ${errorText.substring(0, 200)}`; // Log a snippet
           console.error("Meshy API Create Task Text Error:", createTaskRes.status, errorText);
      }
      return NextResponse.json({ error: `Failed to create Meshy task: ${errorDetails}` }, { status: createTaskRes.status });
    }

    const createTaskData = await createTaskRes.json();
    const taskId = createTaskData.result;
    console.log(`Meshy task created with ID: ${taskId}`);

    if (!taskId) {
        console.error("Meshy API did not return a task ID in create response:", createTaskData);
        return NextResponse.json({ error: 'Meshy API did not return a task ID' }, { status: 500 });
    }

    // --- Step 2: Poll for Task Completion ---
    const pollingInterval = 3000; // Poll every 3 seconds
    const pollingTimeout = 120000; // Timeout after 120 seconds (2 minutes)
    const startTime = Date.now();

    console.log(`Starting polling for task ${taskId}...`);

    while (Date.now() - startTime < pollingTimeout) {
        await sleep(pollingInterval); // Wait before polling

        const getTaskRes = await fetch(`https://api.meshy.ai/openapi/v1/image-to-3d/${taskId}`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!getTaskRes.ok) {
             let errorDetails = `Meshy API GET task status failed with status ${getTaskRes.status}: ${getTaskRes.statusText}`;
             try {
                 const errorJson = await getTaskRes.json();
                 errorDetails = `Meshy API GET task failed: ${errorJson?.message || JSON.stringify(errorJson)}`;
                 console.error("Meshy API GET Task JSON Error:", getTaskRes.status, errorJson);
             } catch {
                 const errorText = await getTaskRes.text();
                 errorDetails = `Meshy API GET task failed: ${getTaskRes.status} ${getTaskRes.statusText} - ${errorText.substring(0, 200)}`;
                 console.error("Meshy API GET Task Text Error:", getTaskRes.status, errorText);
             }
             // If task not found or other errors, break polling
             return NextResponse.json({ error: `Failed to get Meshy task status: ${errorDetails}` }, { status: getTaskRes.status });
        }

        const taskData = await getTaskRes.json();
        console.log(`Polling task ${taskId}, status: ${taskData.status}, progress: ${taskData.progress}`);


        if (taskData.status === 'SUCCEEDED') {
            const modelUrl = taskData.model_urls?.glb;

            if (modelUrl) {
                console.log(`Task ${taskId} SUCCEEDED, GLB URL: ${modelUrl}`);
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
    // Catch any unexpected errors during the process
    console.error("Unexpected Backend Error in /api/meshy-3d:", error);
    // Check if it's an Error instance to get message and stack
    const errorMessage = error instanceof Error ? error.message : String(error);
    const errorStack = error instanceof Error ? error.stack : 'N/A';
    console.error("Error details:", errorMessage, errorStack);

    return NextResponse.json({ error: `Internal server error: ${errorMessage}` }, { status: 500 });
  }
} 