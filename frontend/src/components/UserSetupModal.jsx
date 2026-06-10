import { useState } from 'react';

export default function UserSetupModal({ onConfirm }) {
  const [name, setName] = useState('');

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(6px)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'hsl(var(--background))', borderRadius:16, width:380, padding:'32px 28px', boxShadow:'0 20px 60px rgba(0,0,0,.25)', textAlign:'center' }}>
        <div style={{ width:48, height:48, borderRadius:12, background:'linear-gradient(135deg,hsl(221 83% 53%),hsl(199 89% 60%))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', margin:'0 auto 16px' }}>NT</div>
        <h2 style={{ fontSize:18, fontWeight:700, marginBottom:8 }}>NT Sys 챗봇</h2>
        <p style={{ fontSize:13, color:'hsl(var(--muted-foreground))', marginBottom:24 }}>이름을 입력하면 대화 기록이 개인별로 저장됩니다</p>
        <input
          autoFocus
          style={{ width:'100%', padding:'10px 14px', border:'1px solid hsl(var(--border))', borderRadius:9, fontSize:14, outline:'none', fontFamily:'inherit', background:'hsl(var(--background))', color:'hsl(var(--foreground))', boxSizing:'border-box', marginBottom:14 }}
          placeholder="이름 입력 (예: 홍길동)"
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && name.trim() && onConfirm(name.trim())}
        />
        <button
          onClick={() => onConfirm(name.trim() || '기본 사용자')}
          style={{ width:'100%', padding:'11px', border:'none', borderRadius:9, background:'hsl(var(--primary))', color:'hsl(var(--primary-foreground))', fontSize:14, fontWeight:700, cursor:'pointer', fontFamily:'inherit' }}
        >
          시작하기
        </button>
        <button
          onClick={() => onConfirm('기본 사용자')}
          style={{ marginTop:8, width:'100%', padding:'8px', border:'none', borderRadius:9, background:'transparent', color:'hsl(var(--muted-foreground))', fontSize:12, cursor:'pointer', fontFamily:'inherit' }}
        >
          건너뛰기
        </button>
      </div>
    </div>
  );
}
