import { useRef, useState } from 'react';
import { ArrowUpIcon } from 'lucide-react';

export default function MessageInput({ compareMode, onSend }) {
  const [text, setText] = useState('');
  const [target, setTarget] = useState('both');
  const [sending, setSending] = useState(false);
  const ref = useRef(null);

  function resize() {
    const ta = ref.current;
    if (ta) { ta.style.height = 'auto'; ta.style.height = Math.min(ta.scrollHeight, 160) + 'px'; }
  }

  async function handleSend() {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setText('');
    if (ref.current) ref.current.style.height = 'auto';
    try { await onSend(t, target); } finally {
      setSending(false);
      ref.current?.focus();
    }
  }

  function onKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault(); handleSend();
    }
  }

  const canSend = !!text.trim() && !sending;
  const targets = [{ id: 'left', label: '좌측만' }, { id: 'both', label: '양쪽' }, { id: 'right', label: '우측만' }];

  return (
    <div style={{
      padding: 'var(--composer-padding, 10px) 16px 20px',
      display: 'flex', flexDirection: 'column', alignItems: 'center',
      background: 'hsl(var(--muted))',
    }}>
      {/* 전송 대상 토글 */}
      {compareMode && (
        <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8, width:'100%', maxWidth:'var(--thread-max-width)', fontSize:12, color:'hsl(var(--muted-foreground))' }}>
          <span style={{ fontWeight:500 }}>전송</span>
          {targets.map(b => (
            <button key={b.id} onClick={() => setTarget(b.id)} style={{
              padding:'3px 12px', borderRadius:99, fontSize:12, cursor:'pointer',
              fontFamily:'inherit', transition:'all .12s', border:'1px solid',
              borderColor: target===b.id ? 'hsl(var(--primary))' : 'hsl(var(--border))',
              background: target===b.id ? 'hsl(var(--primary))' : 'hsl(var(--background))',
              color: target===b.id ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              fontWeight: target===b.id ? 600 : 400,
            }}>{b.label}</button>
          ))}
        </div>
      )}

      {/* Composer — assistant-ui 스타일 */}
      <div style={{
        width: '100%', maxWidth: 'var(--thread-max-width)',
        background: 'hsl(var(--background))',
        border: '1px solid hsl(var(--border))',
        borderRadius: 'var(--composer-radius, 1.5rem)',
        boxShadow: '0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.06)',
        transition: 'box-shadow .15s',
        overflow: 'hidden',
      }}
      onFocus={e => e.currentTarget.style.boxShadow = '0 0 0 2px hsl(var(--ring) / 0.2), 0 2px 8px rgba(0,0,0,.08)'}
      onBlur={e => e.currentTarget.style.boxShadow = '0 0 0 1px rgba(0,0,0,.04), 0 2px 8px rgba(0,0,0,.06)'}
      >
        <div style={{ display:'flex', alignItems:'flex-end', padding:'10px 12px 10px 16px', gap:8 }}>
          <textarea
            ref={ref}
            value={text}
            onChange={e => { setText(e.target.value); resize(); }}
            onKeyDown={onKeyDown}
            placeholder="메시지 입력..."
            rows={1}
            style={{
              flex:1, background:'none', border:'none', outline:'none',
              fontSize:15, fontFamily:'inherit', resize:'none',
              lineHeight:1.5, maxHeight:160,
              color:'hsl(var(--foreground))', padding:'2px 0',
            }}
          />
          {/* 전송 버튼 — assistant-ui 동그란 버튼 */}
          <button
            onClick={handleSend}
            disabled={!canSend}
            aria-label="메시지 전송"
            style={{
              width:32, height:32, borderRadius:'50%', border:'none',
              cursor: canSend ? 'pointer' : 'not-allowed', flexShrink:0,
              display:'flex', alignItems:'center', justifyContent:'center',
              background: canSend ? 'hsl(var(--primary))' : 'hsl(var(--muted))',
              color: canSend ? 'hsl(var(--primary-foreground))' : 'hsl(var(--muted-foreground))',
              transition:'background .12s, transform .08s',
            }}
            onMouseDown={e => { if(canSend) e.currentTarget.style.transform='scale(.9)'; }}
            onMouseUp={e => e.currentTarget.style.transform='scale(1)'}
          >
            <ArrowUpIcon size={16} strokeWidth={2.5} />
          </button>
        </div>
        <p style={{ fontSize:11, color:'hsl(var(--muted-foreground))', textAlign:'center', padding:'0 16px 10px', opacity:.7 }}>
          표준국어대사전 · 공공데이터 공통표준 기반
        </p>
      </div>
    </div>
  );
}
