import { useState } from 'react';

export default function ApiKeyModal({ onConnect, onClose }) {
  const [key, setKey] = useState('');
  const [error, setError] = useState(false);

  function handleConnect() {
    if (!key.startsWith('sk-ant-')) { setError(true); return; }
    onConnect(key.trim());
    onClose();
  }

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{position:'fixed',inset:0,background:'rgba(0,0,0,.4)',zIndex:400,backdropFilter:'blur(3px)'}}
      />
      {/* Modal */}
      <div
        className="modal-pop"
        style={{
          position:'fixed',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
          background:'var(--white)',borderRadius:16,padding:28,width:420,maxWidth:'90vw',
          boxShadow:'0 20px 60px rgba(0,0,0,.15)',zIndex:401,
        }}
      >
        <div style={{display:'flex',alignItems:'center',gap:10,marginBottom:8}}>
          <span style={{fontSize:12,fontWeight:700,padding:'3px 7px',borderRadius:6,background:'hsl(var(--muted))',color:'hsl(var(--muted-foreground))'}}>API</span>
          <h2 style={{fontSize:16,fontWeight:700}}>Claude API 키 연결</h2>
        </div>
        <p style={{fontSize:13,color:'var(--sub)',lineHeight:1.6,marginBottom:18}}>
          API 키를 입력하면 Qwen과 Claude의 답변을 나란히 비교할 수 있습니다.<br/>
          키는 브라우저에만 저장됩니다.
        </p>
        <input
          type="password"
          value={key}
          onChange={e=>{ setKey(e.target.value); setError(false); }}
          onKeyDown={e=>{ if(e.key==='Enter') handleConnect(); }}
          placeholder="sk-ant-api03-..."
          autoComplete="off"
          autoFocus
          style={{
            width:'100%',padding:'10px 14px',
            border:`1px solid ${error ? '#ef4444' : 'var(--border)'}`,
            borderRadius:10,fontSize:13,outline:'none',fontFamily:'monospace',
          }}
        />
        <div style={{fontSize:11.5,color:'#9ca3af',marginTop:6}}>
          키 발급 → <a href="https://console.anthropic.com" target="_blank" rel="noreferrer" style={{color:'var(--blue)',textDecoration:'none'}}>console.anthropic.com</a>
        </div>
        <div style={{display:'flex',gap:8,marginTop:16,justifyContent:'flex-end'}}>
          <button
            onClick={onClose}
            style={{padding:'8px 18px',borderRadius:8,border:'1px solid var(--border)',background:'var(--white)',cursor:'pointer',fontSize:13,color:'#555'}}
          >취소</button>
          <button
            onClick={handleConnect}
            style={{padding:'8px 20px',borderRadius:8,border:'none',background:'var(--text)',color:'var(--white)',cursor:'pointer',fontSize:13,fontWeight:600}}
            onMouseEnter={e=>e.currentTarget.style.background='#333'}
            onMouseLeave={e=>e.currentTarget.style.background='var(--text)'}
          >연결하기</button>
        </div>
      </div>
    </>
  );
}
