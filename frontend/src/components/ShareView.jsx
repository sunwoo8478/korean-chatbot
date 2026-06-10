import { useState, useEffect, useRef } from 'react';
import { parseMarkdown, renderMermaidInEl } from '../utils/markdown';

export default function ShareView({ shareId }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const contentRef = useRef(null);

  useEffect(() => {
    fetch(`/api/share/${shareId}`)
      .then(r => { if (!r.ok) throw new Error('링크가 만료되었거나 존재하지 않습니다.'); return r.json(); })
      .then(setData)
      .catch(e => setError(e.message));
  }, [shareId]);

  useEffect(() => {
    if (data && contentRef.current) {
      try { contentRef.current.innerHTML = parseMarkdown(data.message_content); }
      catch { contentRef.current.textContent = data.message_content; }
    }
  }, [data]);

  return (
    <div style={{ minHeight:'100vh', background:'hsl(var(--background))', display:'flex', flexDirection:'column', alignItems:'center', padding:'40px 16px' }}>
      <div style={{ width:'100%', maxWidth:720 }}>
        <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
          <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,hsl(221 83% 53%),hsl(199 89% 60%))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff' }}>NT</div>
          <div>
            <p style={{ fontSize:13, fontWeight:700 }}>NT Sys 챗봇 공유 답변</p>
            {data && <p style={{ fontSize:11, color:'hsl(var(--muted-foreground))', marginTop:1 }}>
              {new Date(data.created_at).toLocaleString('ko-KR')} 공유됨 · {new Date(data.expires_at).toLocaleDateString('ko-KR')} 만료
            </p>}
          </div>
        </div>

        {error && (
          <div style={{ border:'1px solid #fecaca', background:'#fef2f2', borderRadius:10, padding:'20px 24px', color:'#dc2626', fontSize:14 }}>
            {error}
          </div>
        )}

        {data && (
          <div style={{ border:'1px solid hsl(var(--border))', borderRadius:12, overflow:'hidden' }}>
            {data.title && (
              <div style={{ padding:'14px 20px', borderBottom:'1px solid hsl(var(--border))', background:'hsl(var(--muted))' }}>
                <p style={{ fontSize:14, fontWeight:700 }}>{data.title}</p>
              </div>
            )}
            <div style={{ padding:'20px 24px' }}>
              <div ref={contentRef} className="aui-bot-bubble" style={{ fontSize:14, lineHeight:1.7 }}/>
            </div>
            <div style={{ padding:'12px 20px', borderTop:'1px solid hsl(var(--border))', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontSize:11, color:'hsl(var(--muted-foreground))' }}>공공데이터 공통표준 기반 답변</span>
              <button
                onClick={() => navigator.clipboard.writeText(window.location.href)}
                style={{ padding:'5px 12px', border:'1px solid hsl(var(--border))', borderRadius:7, background:'hsl(var(--background))', fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', color:'hsl(var(--foreground))' }}
              >링크 복사</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
