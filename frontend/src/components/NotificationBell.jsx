import { useState, useEffect, useRef } from 'react';
import { XIcon } from 'lucide-react';

const TYPE_COLOR = { info:'#2563eb', success:'#16a34a', warning:'#d97706', error:'#dc2626' };
const TYPE_LABEL = { info:'정보', success:'완료', warning:'주의', error:'오류' };

export default function NotificationBell() {
  const [open, setOpen]         = useState(false);
  const [notifs, setNotifs]     = useState([]);
  const [unread, setUnread]     = useState(0);
  const ref = useRef(null);

  const load = async () => {
    const [n, u] = await Promise.all([
      fetch('/api/notifications').then(r=>r.json()),
      fetch('/api/notifications/unread-count').then(r=>r.json()),
    ]);
    setNotifs(n);
    setUnread(u.count);
  };

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const markAll = async () => { await fetch('/api/notifications/read-all', {method:'PATCH'}); load(); };
  const markOne = async (id) => { await fetch(`/api/notifications/${id}/read`, {method:'PATCH'}); load(); };
  const del     = async (id) => { await fetch(`/api/notifications/${id}`, {method:'DELETE'}); load(); };

  const handleOpen = () => { setOpen(o=>!o); if (!open && unread > 0) markAll(); };

  return (
    <div ref={ref} style={{position:'relative'}}>
      <button
        onClick={handleOpen}
        style={{
          position:'relative', width:32, height:32, borderRadius:8,
          border:'1px solid hsl(var(--border))',
          background:'hsl(var(--background))',
          cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center',
          color:'hsl(var(--foreground))', fontSize:16,
        }}
      >
        &#9741;
        {unread > 0 && (
          <span style={{
            position:'absolute', top:-4, right:-4,
            minWidth:16, height:16, borderRadius:99,
            background:'#dc2626', color:'#fff',
            fontSize:10, fontWeight:700,
            display:'flex', alignItems:'center', justifyContent:'center',
            padding:'0 3px',
          }}>{unread > 9 ? '9+' : unread}</span>
        )}
      </button>

      {open && (
        <div style={{
          position:'absolute', top:38, right:0, width:340,
          background:'hsl(var(--background))',
          border:'1px solid hsl(var(--border))',
          borderRadius:12, boxShadow:'0 8px 32px rgba(0,0,0,.15)',
          zIndex:200, overflow:'hidden',
        }}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 16px',borderBottom:'1px solid hsl(var(--border))'}}>
            <span style={{fontSize:13,fontWeight:700}}>알림</span>
            <div style={{display:'flex',gap:8,alignItems:'center'}}>
              {unread > 0 && <button onClick={markAll} style={{fontSize:11,color:'hsl(var(--muted-foreground))',border:'none',background:'none',cursor:'pointer',fontFamily:'inherit'}}>모두 읽음</button>}
              <button onClick={()=>setOpen(false)} style={{border:'none',background:'none',cursor:'pointer',color:'hsl(var(--muted-foreground))',display:'flex'}}><XIcon size={14}/></button>
            </div>
          </div>

          <div style={{maxHeight:360,overflowY:'auto'}}>
            {notifs.length === 0 ? (
              <p style={{padding:'24px 16px',textAlign:'center',color:'hsl(var(--muted-foreground))',fontSize:13}}>알림 없음</p>
            ) : notifs.map(n => (
              <div key={n.id} onClick={()=>markOne(n.id)} style={{
                display:'flex',alignItems:'flex-start',gap:10,padding:'12px 16px',
                borderBottom:'1px solid hsl(var(--border))',cursor:'pointer',
                background: n.is_read ? 'transparent' : 'hsl(var(--primary)/0.04)',
                transition:'background .1s',
              }}
                onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
                onMouseLeave={e=>e.currentTarget.style.background=n.is_read?'transparent':'hsl(var(--primary)/0.04)'}
              >
                <span style={{
                  width:6, height:6, borderRadius:'50%', flexShrink:0, marginTop:5,
                  background: n.is_read ? 'hsl(var(--border))' : TYPE_COLOR[n.type]||'#2563eb',
                }}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                    <span style={{fontSize:12,fontWeight:600}}>{n.title}</span>
                    <span style={{fontSize:10,padding:'1px 6px',borderRadius:99,background:(TYPE_COLOR[n.type]||'#2563eb')+'15',color:TYPE_COLOR[n.type]||'#2563eb',fontWeight:600}}>{TYPE_LABEL[n.type]||n.type}</span>
                  </div>
                  <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',lineHeight:1.4}}>{n.message}</p>
                  <p style={{fontSize:10,color:'hsl(var(--muted-foreground))',marginTop:4}}>{new Date(n.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <button onClick={e=>{e.stopPropagation();del(n.id);}} style={{border:'none',background:'none',cursor:'pointer',color:'hsl(var(--muted-foreground))',padding:2,display:'flex',flexShrink:0}}><XIcon size={12}/></button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
