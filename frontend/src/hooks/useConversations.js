import { useState, useCallback } from 'react';

export function useConversations(username = '기본 사용자') {
  const [conversations, setConversations] = useState([]);
  const [currentConvId, setCurrentConvId] = useState(null);

  const loadList = useCallback(async () => {
    try {
      const res = await fetch(`/api/conversations?username=${encodeURIComponent(username)}`);
      if (!res.ok) return;
      setConversations(await res.json());
    } catch {}
  }, [username]);

  const loadConversation = useCallback(async (id) => {
    const res = await fetch(`/api/conversations/${id}`);
    if (!res.ok) return null;
    return res.json();
  }, []);

  const deleteConversation = useCallback(async (id) => {
    await fetch(`/api/conversations/${id}`, { method: 'DELETE' });
  }, []);

  const saveMessage = useCallback(async (convId, role, content, model, sources) => {
    await fetch(`/api/conversations/${convId}/messages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role, model, content, sources: sources || [] }),
    });
  }, []);

  const createConversation = useCallback(async (title, model) => {
    const res = await fetch('/api/conversations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: title.slice(0, 40), model: model || 'qwen', username }),
    });
    return res.json();
  }, [username]);

  return {
    conversations, currentConvId, setCurrentConvId,
    loadList, loadConversation, deleteConversation, saveMessage, createConversation,
  };
}
