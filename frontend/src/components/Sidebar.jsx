import { useMemo, useState, useRef, useCallback, useEffect } from 'react';

const S = {
  bg:     'hsl(240 5.9% 10%)',
  hover:  'rgba(255,255,255,.07)',
  active: 'rgba(255,255,255,.13)',
  text:   'hsl(0 0% 90%)',
  sub:    'hsl(240 4% 52%)',
  border: 'rgba(255,255,255,.08)',
  red:    'hsl(0 72% 65%)',
};

const MIN_W = 180;
const MAX_W = 480;
const DEFAULT_W = 260;

function groupByDate(convs) {
  const groups = {};
  const today     = new Date(); today.setHours(0,0,0,0);
  const yesterday = new Date(today); yesterday.setDate(today.getDate()-1);
  const week      = new Date(today); week.setDate(today.getDate()-7);
  convs.forEach(c => {
    const d = new Date(c.updated_at);
    const label = d >= today ? '오늘' : d >= yesterday ? '어제' : d >= week ? '이번 주' : d.toLocaleDateString('ko-KR',{month:'long'});
    if (!groups[label]) groups[label] = [];
    groups[label].push(c);
  });
  return groups;
}

export default function Sidebar({
  conversations, currentConvId,
  qwenModel, compareType, darkMode,
  onNewChat, onLoadConv, onDeleteConv,
  onSetQwenModel, onToggleQwen27, onToggleClaude, onToggleDark,
  onOpenSkills, onOpenDocs, onOpenStandards, onOpenAdmin, onRenameConv,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [width, setWidth] = useState(() => {
    return parseInt(localStorage.getItem('sidebar_width') || DEFAULT_W, 10);
  });
  const dragging = useRef(false);
  const startX   = useRef(0);
  const startW   = useRef(0);

  const [convSearch, setConvSearch] = useState('');
  const groups       = useMemo(() => groupByDate(conversations), [conversations]);
  const filteredConvs = useMemo(() =>
    convSearch ? conversations.filter(c => c.title.toLowerCase().includes(convSearch.toLowerCase())) : conversations
  , [conversations, convSearch]);
  const qwen27Active = compareType === 'qwen27';
  const claudeActive = compareType === 'claude';

  // 드래그 핸들러
  const onMouseDown = useCallback((e) => {
    if (collapsed) return;
    dragging.current = true;
    startX.current   = e.clientX;
    startW.current   = width;
    document.body.style.userSelect = 'none';
    document.body.style.cursor     = 'col-resize';
  }, [collapsed, width]);

  useEffect(() => {
    const onMouseMove = (e) => {
      if (!dragging.current) return;
      const delta = e.clientX - startX.current;
      const next  = Math.min(MAX_W, Math.max(MIN_W, startW.current + delta));
      setWidth(next);
    };
    const onMouseUp = () => {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.userSelect = '';
      document.body.style.cursor     = '';
      setWidth(w => { localStorage.setItem('sidebar_width', w); return w; });
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup',   onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup',   onMouseUp);
    };
  }, []);

  const currentWidth = collapsed ? 52 : width;

  return (
    <div style={{ display: 'flex', height: '100%', flexShrink: 0, position: 'relative' }}>
      {/* 사이드바 본체 */}
      <aside
        style={{
          width: currentWidth,
          minWidth: currentWidth,
          background: S.bg,
          display: 'flex',
          flexDirection: 'column',
          height: '100%',
          overflow: 'hidden',
          transition: collapsed ? 'width .2s ease, min-width .2s ease' : 'none',
        }}
      >
        {/* 헤더 */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'14px 10px 12px', borderBottom:`1px solid ${S.border}`, flexShrink:0 }}>
          {!collapsed && (
            <div style={{ display:'flex', alignItems:'center', gap:10, minWidth:0 }}>
              <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,hsl(221 83% 53%) 0%,hsl(199 89% 60%) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', flexShrink:0 }}>
                NT
              </div>
              <div style={{ minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:700, color:S.text, lineHeight:1.3, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>한국어 표준</div>
                <div style={{ fontSize:10.5, color:S.sub, marginTop:1 }}>지식 어시스턴트</div>
              </div>
            </div>
          )}
          {collapsed && (
            <div style={{ width:32, height:32, borderRadius:8, background:'linear-gradient(135deg,hsl(221 83% 53%) 0%,hsl(199 89% 60%) 100%)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800, color:'#fff', margin:'0 auto' }}>
              NT
            </div>
          )}
          {!collapsed && (
            <div style={{ display:'flex', gap:4, flexShrink:0 }}>
              <button
                onClick={onToggleDark}
                title={darkMode ? '라이트 모드' : '다크 모드'}
                style={{ width:28, height:28, borderRadius:7, border:`1px solid ${S.border}`, background:'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.12)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
              >
                {darkMode ? 'L' : 'D'}
              </button>
              <button
                onClick={() => setCollapsed(true)}
                title="사이드바 접기"
                style={{ width:28, height:28, borderRadius:7, border:`1px solid ${S.border}`, background:'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
                onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.12)'}
                onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
              >
                <CollapseIcon />
              </button>
            </div>
          )}
        </div>

        {/* 접힌 상태: 펼치기 버튼만 */}
        {collapsed && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', padding:'10px 0', gap:8 }}>
            <button
              onClick={() => setCollapsed(false)}
              title="사이드바 펼치기"
              style={{ width:32, height:32, borderRadius:7, border:`1px solid ${S.border}`, background:'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.12)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
            >
              <ExpandIcon />
            </button>
            <button onClick={onNewChat} title="새 대화" style={{ width:32, height:32, borderRadius:7, border:`1px solid ${S.border}`, background:'rgba(255,255,255,.06)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', transition:'background .15s' }}
              onMouseEnter={e=>e.currentTarget.style.background='rgba(255,255,255,.12)'}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.06)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={S.text} strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </button>
          </div>
        )}

        {/* 펼친 상태 콘텐츠 */}
        {!collapsed && <>
          {/* 새 대화 */}
          <div style={{ padding:'10px 8px 4px' }}>
            <button
              onClick={onNewChat}
              style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:13, color:S.text, border:`1px solid ${S.border}`, background:'rgba(255,255,255,.04)', width:'100%', textAlign:'left', fontFamily:'inherit', transition:'background .15s' }}
              onMouseEnter={e=>e.currentTarget.style.background=S.hover}
              onMouseLeave={e=>e.currentTarget.style.background='rgba(255,255,255,.04)'}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              새 대화
            </button>
          </div>

          {/* 대화 검색 + 목록 */}
          <div style={{ padding:'6px 8px 4px', flexShrink:0 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'rgba(255,255,255,.06)', borderRadius:7, padding:'5px 8px', border:`1px solid ${S.border}` }}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={S.sub} strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
              <input
                placeholder="대화 검색..."
                value={convSearch}
                onChange={e=>setConvSearch(e.target.value)}
                style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:12, color:S.text, fontFamily:'inherit' }}
              />
              {convSearch && <button onClick={()=>setConvSearch('')} style={{background:'none',border:'none',cursor:'pointer',color:S.sub,fontSize:12,padding:0,lineHeight:1}}>✕</button>}
            </div>
          </div>
          <div style={{ flex:1, overflowY:'auto', padding:'0 8px', minHeight:0 }}>
            {filteredConvs.length === 0 && (
              <p style={{ padding:'8px 4px', fontSize:12, color:S.sub }}>{convSearch ? '검색 결과 없음' : '대화 기록 없음'}</p>
            )}
            {convSearch ? (
              filteredConvs.map(c => (
                <ConvItem key={c.id} conv={c} active={c.id===currentConvId} onLoad={onLoadConv} onDelete={onDeleteConv} onRename={onRenameConv} s={S} />
              ))
            ) : (
              Object.entries(groups).map(([label, items]) => (
                <div key={label}>
                  <p style={{ fontSize:10.5, color:S.sub, padding:'8px 4px 3px', fontWeight:600 }}>{label}</p>
                  {items.map(c => (
                    <ConvItem key={c.id} conv={c} active={c.id===currentConvId} onLoad={onLoadConv} onDelete={onDeleteConv} onRename={onRenameConv} s={S} />
                  ))}
                </div>
              ))
            )}
          </div>

          {/* 하단 설정 */}
          <div style={{ borderTop:`1px solid ${S.border}`, padding:'10px 8px', flexShrink:0 }}>
            <p style={{ fontSize:10.5, color:S.sub, padding:'2px 4px 6px', fontWeight:600, letterSpacing:.4, textTransform:'uppercase' }}>모델 선택</p>
            <select
              value={qwenModel}
              onChange={e=>onSetQwenModel(e.target.value)}
              style={{ width:'100%', background:'rgba(255,255,255,.06)', border:`1px solid ${S.border}`, borderRadius:8, color:S.text, fontSize:12.5, padding:'6px 10px', cursor:'pointer', outline:'none', fontFamily:'inherit', marginBottom:8 }}
            >
              <option value="35b">Qwen 35B (MoE)</option>
              <option value="27b">Nemotron-3 Nano 30B</option>
            </select>

            <p style={{ fontSize:10.5, color:S.sub, padding:'2px 4px 6px', fontWeight:600, letterSpacing:.4, textTransform:'uppercase' }}>비교 모드</p>
            <SidebarBtn active={qwen27Active} onClick={onToggleQwen27} s={S}>Qwen 27B 비교</SidebarBtn>
            <SidebarBtn active={claudeActive} onClick={onToggleClaude} s={S}>
              {claudeActive ? 'Claude 연결됨' : 'Claude 비교 연결'}
            </SidebarBtn>

            <div style={{ height:1, background:S.border, margin:'10px 4px' }}/>

            <p style={{ fontSize:10.5, color:S.sub, padding:'2px 4px 6px', fontWeight:600, letterSpacing:.4, textTransform:'uppercase' }}>도구</p>
            <SidebarBtn active={false} onClick={onOpenSkills} s={S}>스킬 관리</SidebarBtn>
            <SidebarBtn active={false} onClick={onOpenDocs} s={S}>문서 업로드</SidebarBtn>
            <SidebarBtn active={false} onClick={onOpenStandards} s={S}>공통표준 업데이트</SidebarBtn>

            <div style={{ height:1, background:S.border, margin:'10px 4px' }}/>
            <SidebarBtn active={false} onClick={onOpenAdmin} s={S}>관리자 패널</SidebarBtn>
          </div>
        </>}
      </aside>

      {/* 드래그 핸들 (접히지 않은 상태에서만) */}
      {!collapsed && (
        <div
          onMouseDown={onMouseDown}
          style={{
            width: 4,
            cursor: 'col-resize',
            background: 'transparent',
            flexShrink: 0,
            transition: 'background .15s',
            zIndex: 10,
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,.15)'}
          onMouseLeave={e => { if (!dragging.current) e.currentTarget.style.background = 'transparent'; }}
        />
      )}
    </div>
  );
}

function CollapseIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 90%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="15 18 9 12 15 6"/>
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="hsl(0 0% 90%)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}

function SidebarBtn({ active, onClick, children, s }) {
  return (
    <button
      onClick={onClick}
      style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 12px', borderRadius:8, cursor:'pointer', fontSize:13, color:s.text, border:'none', background:active?s.active:'none', width:'100%', textAlign:'left', transition:'background .15s', fontFamily:'inherit', marginBottom:2 }}
      onMouseEnter={e=>{ if(!active) e.currentTarget.style.background=s.hover; }}
      onMouseLeave={e=>{ if(!active) e.currentTarget.style.background='none'; }}
    >
      <span style={{ width:8, height:8, borderRadius:'50%', flexShrink:0, background:active?'hsl(142 71% 55%)':'hsl(240 4% 35%)', boxShadow:active?'0 0 6px hsl(142 71% 55%)':'none', transition:'all .2s' }}/>
      {children}
    </button>
  );
}

function ConvItem({ conv, active, onLoad, onDelete, onRename, s }) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle]     = useState(conv.title);
  const inputRef = useRef(null);

  const startEdit = (e) => { e.stopPropagation(); setEditing(true); setTimeout(()=>inputRef.current?.select(), 50); };
  const saveEdit  = async () => {
    setEditing(false);
    if (title.trim() && title !== conv.title) await onRename(conv.id, title.trim());
    else setTitle(conv.title);
  };

  if (editing) return (
    <div style={{ padding:'4px 8px' }}>
      <input
        ref={inputRef}
        value={title}
        onChange={e=>setTitle(e.target.value)}
        onBlur={saveEdit}
        onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape'){setEditing(false);setTitle(conv.title);} }}
        style={{ width:'100%', padding:'5px 8px', borderRadius:7, border:`1px solid ${s.border}`, background:'rgba(255,255,255,.1)', color:s.text, fontSize:12.5, fontFamily:'inherit', outline:'none', boxSizing:'border-box' }}
        onClick={e=>e.stopPropagation()}
      />
    </div>
  );

  return (
    <div
      role="button" tabIndex={0}
      onClick={() => onLoad(conv.id)}
      onKeyDown={e => e.key === 'Enter' && onLoad(conv.id)}
      style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'7px 10px', borderRadius:8, cursor:'pointer', fontSize:12.5, color:s.text, gap:4, transition:'background .15s', background:active?s.active:'none', userSelect:'none' }}
      onMouseEnter={e=>{ e.currentTarget.style.background=s.active; ['del','ren'].forEach(c=>{ e.currentTarget.querySelector('.'+c)?.style && (e.currentTarget.querySelector('.'+c).style.opacity='1'); }); }}
      onMouseLeave={e=>{ e.currentTarget.style.background=active?s.active:'none'; ['del','ren'].forEach(c=>{ e.currentTarget.querySelector('.'+c)?.style && (e.currentTarget.querySelector('.'+c).style.opacity='0'); }); }}
    >
      <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{title}</span>
      <button className="ren" onClick={startEdit}
        style={{ opacity:0, width:18, height:18, borderRadius:4, border:'none', background:'none', color:s.sub, cursor:'pointer', fontSize:12, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'opacity .15s' }}
        onMouseEnter={e=>e.currentTarget.style.color=s.text}
        onMouseLeave={e=>e.currentTarget.style.color=s.sub}
      >✎</button>
      <button className="del" onClick={e=>{ e.stopPropagation(); if(window.confirm('이 대화를 삭제할까요?')) onDelete(conv.id); }}
        style={{ opacity:0, width:18, height:18, borderRadius:4, border:'none', background:'none', color:s.sub, cursor:'pointer', fontSize:13, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'opacity .15s' }}
        onMouseEnter={e=>e.currentTarget.style.color=s.red}
        onMouseLeave={e=>e.currentTarget.style.color=s.sub}
      >✕</button>
    </div>
  );
}
