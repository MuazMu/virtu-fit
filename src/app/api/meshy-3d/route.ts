import { NextResponse } from 'next/server';

// Helper to wait for a given time
function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Tripo error code mapping for user-friendly messages
const TRIPO_ERROR_MAP: Record<number, { message: string; suggestion: string }> = {
  1002: {
    message: 'Authentication failed. Your API key is missing, invalid, or you have no API credits.',
    suggestion: 'Check your API key and ensure you have sufficient API credits (not web credits).',
  },
  2000: {
    message: 'You have exceeded the generation rate limit.',
    suggestion: 'Please retry later. Consider implementing exponential backoff.',
  },
  2001: {
    message: 'Task not found.',
    suggestion: 'Check if you passed the correct task id.',
  },
  2002: {
    message: 'The task type is unsupported.',
    suggestion: 'Check if you passed the correct task type.',
  },
  2003: {
    message: 'The input file is empty.',
    suggestion: 'Check if you passed file, or it may be rejected by the firewall.',
  },
  2004: {
    message: 'The file type is unsupported.',
    suggestion: 'Check if the file you input is supported.',
  },
  2008: {
    message: 'Input violates content policy.',
    suggestion: 'Modify your input and retry.',
  },
  2010: {
    message: 'You need more credits to start a new task.',
    suggestion: 'Review your usage at Billing and purchase more API credits.',
  },
  2015: {
    message: 'The version has been deprecated.',
    suggestion: 'Try a higher model version.',
  },
};

export async function POST(req: Request) {
  const apiKey = process.env.TRIPO_API_KEY;
  if (!apiKey || typeof apiKey !== 'string' || apiKey.trim() === '') {
    return NextResponse.json({ error: 'Server configuration error: Missing Tripo API key' }, { status: 500 });
  }

  try {
    // Accept image_url (data URL or direct URL), taskId, model_version
    const body = await req.json();
    const { image_url, taskId, model_version } = body;

    // Helper: Map Tripo error codes to user-friendly messages
    function tripoErrorResponse(tripoJson: any, traceId: string) {
      const code = tripoJson.code;
      const mapped = TRIPO_ERROR_MAP[code];
      return NextResponse.json({
        error: mapped?.message || tripoJson.message || 'Tripo API error',
        suggestion: mapped?.suggestion || tripoJson.suggestion,
        traceId,
        code,
      }, { status: 500 });
    }

    // --- Polling for existing taskId ---
    if (taskId) {
      const pollRes = await fetch(`https://api.tripo3d.ai/v2/openapi/task/${taskId}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
        },
      });
      const pollTraceId = pollRes.headers.get('X-Tripo-Trace-ID');
      const pollJson = await pollRes.json();
      if (pollJson.code !== 0) {
        return tripoErrorResponse(pollJson, pollTraceId || '');
      }
      if (pollJson.data.status === 'success') {
        const modelUrl = pollJson.data.output?.model;
        if (modelUrl) {
          return NextResponse.json({ modelUrl, traceId: pollTraceId }, { status: 200 });
        } else {
          return NextResponse.json({ error: 'Tripo task succeeded but no model URL found', traceId: pollTraceId }, { status: 500 });
        }
      } else if ([
        'failed', 'cancelled', 'unknown', 'banned', 'expired'
      ].includes(pollJson.data.status)) {
        return NextResponse.json({ error: `Tripo task failed: ${pollJson.data.status}`, traceId: pollTraceId }, { status: 500 });
      } else {
        // Still processing
        return NextResponse.json({ status: 'processing', taskId, traceId: pollTraceId }, { status: 202 });
      }
    }

    // --- Start new task: image_url required ---
    if (!image_url || typeof image_url !== 'string') {
      return NextResponse.json({ error: 'Missing or invalid image_url.' }, { status: 400 });
    }

    // --- Direct image URL support ---
    const isDirectUrl = image_url.startsWith('http://') || image_url.startsWith('https://');
    if (isDirectUrl) {
      // Pass direct URL to Tripo (no upload needed)
      const createTaskBody: any = {
        type: 'image_to_model',
        url: image_url,
        ...(model_version ? { model_version } : {})
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
      const createTaskJson = await createTaskRes.json();
      if (createTaskJson.code !== 0) {
        return tripoErrorResponse(createTaskJson, createTaskTraceId || '');
      }
      const newTaskId = createTaskJson.data.task_id;
      if (!newTaskId) {
        return NextResponse.json({ error: 'No task_id returned from Tripo create task', traceId: createTaskTraceId }, { status: 500 });
      }
      return NextResponse.json({ status: 'processing', taskId: newTaskId, traceId: createTaskTraceId }, { status: 202 });
    }

    // --- Data URL: Use STS upload for large files, direct upload for small ---
    // Helper: Convert data URL to Buffer
    function dataURLtoBuffer(dataurl: string) {
      const arr = dataurl.split(',');
      const mimeMatch = arr[0].match(/:(.*?);/);
      if (!mimeMatch) throw new Error('Invalid data URL');
      const mime = mimeMatch[1];
      const bstr = Buffer.from(arr[1], 'base64');
      return { buffer: bstr, mime };
    }

    const { buffer, mime } = dataURLtoBuffer(image_url);
    const ext = mime.split('/')[1];
    // If >100KB, use STS upload
    if (buffer.length > 100 * 1024) {
      // 1. Get STS token
      const stsRes = await fetch('https://api.tripo3d.ai/v2/openapi/upload/sts/token', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ format: ext }),
      });
      const stsTraceId = stsRes.headers.get('X-Tripo-Trace-ID');
      const stsJson = await stsRes.json();
      if (stsJson.code !== 0) {
        return tripoErrorResponse(stsJson, stsTraceId || '');
      }
      // 2. Upload to S3
      const {
        s3_host,
        resource_bucket,
        resource_uri,
        session_token,
        sts_ak,
        sts_sk
      } = stsJson.data;
      let S3Client, PutObjectCommand;
      try {
        ({ S3Client, PutObjectCommand } = await import('@aws-sdk/client-s3'));
      } catch (e) {
        return NextResponse.json({
          error: 'The AWS SDK (@aws-sdk/client-s3) is required for STS uploads but is not installed.',
          suggestion: 'Add @aws-sdk/client-s3 to your dependencies to enable large file uploads.',
        }, { status: 500 });
      }
      const s3 = new S3Client({
        region: 'us-west-2',
        credentials: {
          accessKeyId: sts_ak,
          secretAccessKey: sts_sk,
          sessionToken: session_token,
        },
        endpoint: `https://${s3_host}`,
        forcePathStyle: true,
      });
      await s3.send(new PutObjectCommand({
        Bucket: resource_bucket,
        Key: resource_uri,
        Body: buffer,
        ContentType: mime,
      }));
      // 3. Use object for task creation
      const createTaskBody: any = {
        type: 'image_to_model',
        object: {
          bucket: resource_bucket,
          key: resource_uri,
        },
        ...(model_version ? { model_version } : {})
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
      const createTaskJson = await createTaskRes.json();
      if (createTaskJson.code !== 0) {
        return tripoErrorResponse(createTaskJson, createTaskTraceId || '');
      }
      const newTaskId = createTaskJson.data.task_id;
      if (!newTaskId) {
        return NextResponse.json({ error: 'No task_id returned from Tripo create task', traceId: createTaskTraceId }, { status: 500 });
      }
      return NextResponse.json({ status: 'processing', taskId: newTaskId, traceId: createTaskTraceId }, { status: 202 });
    } else {
      // --- Small file: direct upload as before ---
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
      const uploadJson = await uploadRes.json();
      if (uploadJson.code !== 0) {
        return tripoErrorResponse(uploadJson, tripoTraceId || '');
      }
      const image_token = uploadJson.data.image_token;
      if (!image_token) {
        return NextResponse.json({ error: 'No image_token returned from Tripo upload', traceId: tripoTraceId }, { status: 500 });
      }
      const createTaskBody: any = {
        type: 'image_to_model',
        file: {
          type: ext,
          file_token: image_token
        },
        ...(model_version ? { model_version } : {})
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
      const createTaskJson = await createTaskRes.json();
      if (createTaskJson.code !== 0) {
        return tripoErrorResponse(createTaskJson, createTaskTraceId || '');
      }
      const newTaskId = createTaskJson.data.task_id;
      if (!newTaskId) {
        return NextResponse.json({ error: 'No task_id returned from Tripo create task', traceId: createTaskTraceId }, { status: 500 });
      }
      return NextResponse.json({ status: 'processing', taskId: newTaskId, traceId: createTaskTraceId }, { status: 202 });
    }
  } catch (error) {
    return NextResponse.json({ error: `Internal server error: ${error instanceof Error ? error.message : String(error)}` }, { status: 500 });
  }
} 