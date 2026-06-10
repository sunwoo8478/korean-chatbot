const SOURCE_COLORS = {
  '사전': 'background:#eff6ff;color:#2563eb',
  '공통표준용어': 'background:#ecfdf5;color:#059669',
  '공통표준단어': 'background:#f0fdf4;color:#16a34a',
  '공통표준도메인': 'background:#faf5ff;color:#7c3aed',
  'PDF매뉴얼': 'background:#fff7ed;color:#ea580c',
  'PDF고시': 'background:#fef2f2;color:#dc2626',
};

function formatContent(content) {
  return (content || '내용 없음')
    .replace(/\] \[/g, ']\n[')
    .replace(/\[([^\]]+)\]/g, (_, t) => `\n<strong>[${t}]</strong>`)
    .trim()
    .replace(/\n/g, '<br>');
}

export default function SourcePanel({ source, onClose }) {
  if (!source) return null;

  const badgeStyle = SOURCE_COLORS[source.source] || 'background:#f4f4f4;color:#555';

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        style={{
          position:'fixed',inset:0,zIndex:300,background:'rgba(0,0,0,.25)',
          backdropFilter:'blur(2px)',
        }}
      />
      {/* Panel */}
      <div style={{
        position:'fixed',right:0,top:0,bottom:0,width:400,maxWidth:'92vw',
        background:'var(--white)',boxShadow:'-4px 0 24px rgba(0,0,0,.12)',
        display:'flex',flexDirection:'column',zIndex:301,
        transform:'translateX(0)',transition:'transform .25s cubic-bezier(.4,0,.2,1)',
      }}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:99,...parseStyle(badgeStyle)}}>
              {source.source}
            </span>
            <span style={{fontSize:14,fontWeight:700,color:'var(--navy)'}}>{source.title}</span>
          </div>
          <button
            onClick={onClose}
            style={{width:28,height:28,borderRadius:6,border:'none',background:'#f4f4f4',cursor:'pointer',fontSize:16,display:'flex',alignItems:'center',justifyContent:'center',color:'var(--sub)'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--border)'}
            onMouseLeave={e=>e.currentTarget.style.background='#f4f4f4'}
          >✕</button>
        </div>
        <div
          style={{flex:1,overflowY:'auto',padding:20,fontSize:13.5,lineHeight:1.7,color:'#444',wordBreak:'break-word'}}
          dangerouslySetInnerHTML={{ __html: formatContent(source.content) }}
        />
      </div>
    </>
  );
}

function parseStyle(str) {
  return Object.fromEntries(
    str.split(';').filter(Boolean).map(s => {
      const [k, v] = s.split(':');
      const key = k.trim().replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      return [key, v.trim()];
    })
  );
}
