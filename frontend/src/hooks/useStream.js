/**
 * SSE streaming hook.
 * Returns a `stream` function that connects to /api/chat/stream.
 *
 * Callbacks:
 *   onSources(sources)    – called once when sources event arrives
 *   onToken(text)         – called for each token
 *   onDone(fullText)      – called when streaming finishes
 *   onError(msg)          – called on error
 */
export function useStream() {
  const stream = async ({
    message,
    model,
    apiKey,
    qwenModel,
    convId,
    history,
    onSources,
    onQuality,
    onToken,
    onDone,
    onError,
  }) => {
    try {
      const resp = await fetch('/api/chat/stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message,
          model,
          api_key: apiKey || '',
          qwen_model: qwenModel,
          conv_id: convId || '',
          history: history || [],
        }),
      });

      if (!resp.ok) {
        onError?.(`HTTP ${resp.status}`);
        return;
      }

      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buf = '';
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const parts = buf.split('\n\n');
        buf = parts.pop();

        for (const part of parts) {
          if (!part.startsWith('data: ')) continue;
          let evt;
          try { evt = JSON.parse(part.slice(6)); } catch { continue; }

          if (evt.type === 'sources' && evt.data?.length) {
            onSources?.(evt.data);
          } else if (evt.type === 'quality') {
            onQuality?.(evt.data);
          } else if (evt.type === 'token') {
            fullText += evt.text;
            onToken?.(fullText);
          } else if (evt.type === 'done') {
            onDone?.(fullText);
          }
        }
      }

      // fallback if no done event
      if (fullText) onDone?.(fullText);
    } catch (e) {
      console.error('stream error:', e);
      onError?.(e.message);
    }
  };

  return { stream };
}
