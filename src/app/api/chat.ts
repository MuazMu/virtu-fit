export async function POST(req: Request) {
  const { message } = await req.json();
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return new Response(JSON.stringify({ error: 'Missing OpenRouter API key' }), { status: 500 });
  }
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-3.5-turbo',
        messages: [
          { role: 'system', content: 'You are a helpful AI fashion stylist.' },
          { role: 'user', content: message },
        ],
      }),
    });
    if (!res.ok) {
      const error = await res.text();
      return new Response(JSON.stringify({ error }), { status: res.status });
    }
    const data = await res.json();
    const aiMessage = data.choices?.[0]?.message?.content || 'Sorry, I could not generate a reply.';
    return new Response(JSON.stringify({ reply: aiMessage }), { status: 200 });
  } catch (err) {
    return new Response(JSON.stringify({ error: 'Failed to connect to OpenRouter API' }), { status: 500 });
  }
} 