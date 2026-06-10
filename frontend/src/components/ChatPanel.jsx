import React, { useEffect, useRef, useState } from 'react';
import Message from './Message';

export default function ChatPanel({ label, chipClass, subLabel, messages, isTyping, compareType, onOpenSource, onDeleteMessage, onEditMessage, onFeedback, convId, onSend }) {
  const scrollRef = useRef(null);
  const [suggested, setSuggested] = useState([]);

  useEffect(() => {
    if (messages.length <= 1 && messages[0]?.suggested) {
      fetch('/api/faq/suggested').then(r=>r.json()).then(setSuggested).catch(()=>{});
    }
  }, [messages.length]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages]);

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0, background:'hsl(var(--background))' }}>

      {/* 패널 헤더 — 비교 모드에서만 표시 */}
      {label && (
        <div style={{
          display:'flex', alignItems:'center', gap:8,
          padding:'8px 16px',
          borderBottom:'1px solid hsl(var(--border))',
          background:'hsl(var(--background))',
          fontSize:12, flexShrink:0, minHeight:38,
        }}>
          <span className={chipClass} style={{ padding:'2px 10px', borderRadius:99, fontSize:11, fontWeight:700 }}>{label}</span>
          <span style={{ color:'hsl(var(--muted-foreground))', fontSize:11 }}>{subLabel}</span>
        </div>
      )}

      {/* 메시지 스크롤 영역 */}
      <div ref={scrollRef} className="messages-scroll"
        style={{ flex:1, overflowY:'auto', scrollBehavior:'smooth' }}
      >
        {/* 메시지들을 중앙 정렬된 컬럼에 배치 */}
        <div style={{ maxWidth:'var(--thread-max-width)', margin:'0 auto', padding:'24px 16px 8px', display:'flex', flexDirection:'column', gap:2 }}>
          {messages.map(msg => (
            <React.Fragment key={msg.id}>
              <Message msg={msg} compareType={compareType} onOpenSource={onOpenSource}
                onDelete={onDeleteMessage} onEdit={onEditMessage} onFeedback={onFeedback} convId={convId}/>
              {msg.suggested && suggested.length > 0 && (
                <div style={{ marginTop:16, display:'flex', flexWrap:'wrap', gap:8 }}>
                  {suggested.map((q,i) => (
                    <button key={i} onClick={()=>onSend&&onSend(q)}
                      style={{ padding:'7px 14px', border:'1px solid hsl(var(--border))', borderRadius:99, background:'hsl(var(--background))', color:'hsl(var(--foreground))', fontSize:12, cursor:'pointer', fontFamily:'inherit', transition:'all .15s', textAlign:'left' }}
                      onMouseEnter={e=>{e.currentTarget.style.background='hsl(var(--muted))';e.currentTarget.style.borderColor='hsl(var(--primary))';}}
                      onMouseLeave={e=>{e.currentTarget.style.background='hsl(var(--background))';e.currentTarget.style.borderColor='hsl(var(--border))';}}
                    >{q}</button>
                  ))}
                </div>
              )}
            </React.Fragment>
          ))}

          {isTyping && (
            <div style={{ display:'flex', gap:12, alignItems:'center', padding:'8px 0' }}>
              <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,fontWeight:700,background:'hsl(142 71% 45%)',color:'#fff',flexShrink:0 }}>AI</div>
              <div style={{ display:'flex', gap:4, paddingTop:2 }}>
                <div className="typing-dot"/><div className="typing-dot"/><div className="typing-dot"/>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
