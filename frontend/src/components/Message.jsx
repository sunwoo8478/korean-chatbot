import React, { useEffect, useRef, useState } from 'react';
import { parseMarkdown, renderMermaidInEl } from '../utils/markdown';
import { addInlineCitations } from '../utils/citations';
import ExportMenu from './ExportMenu';

function Avatar({ role, isClaude, isQ27 }) {
  let bg = 'hsl(142 71% 45%)', text = 'AI', fs = 11;
  if (role === 'user')  { bg = 'hsl(var(--primary))'; text = '나'; fs = 12; }
  else if (isQ27)       { bg = 'hsl(262 83% 58%)'; text = '27'; }
  else if (isClaude)    { bg = 'hsl(38 92% 50%)'; text = 'C'; }
  return (
    <div aria-hidden style={{
      width:28, height:28, borderRadius:'50%', flexShrink:0,
      display:'flex', alignItems:'center', justifyContent:'center',
      fontSize:fs, fontWeight:700, letterSpacing:'-0.5px',
      background:bg, color:'#fff', userSelect:'none',
    }}>{text}</div>
  );
}

function CopyBtn({ text }) {
  const [copied, setCopied] = useState(false);
  const copy = () => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button onClick={copy} title="복사" style={{
      display:'flex', alignItems:'center', gap:4,
      padding:'4px 8px', borderRadius:6,
      border:'1px solid hsl(var(--border))',
      background: copied ? 'hsl(var(--muted))' : 'hsl(var(--background))',
      color: copied ? '#16a34a' : 'hsl(var(--muted-foreground))',
      fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
      transition:'all .15s',
    }}
      onMouseEnter={e=>{ if(!copied){ e.currentTarget.style.background='hsl(var(--muted))'; e.currentTarget.style.color='hsl(var(--foreground))'; }}}
      onMouseLeave={e=>{ if(!copied){ e.currentTarget.style.background='hsl(var(--background))'; e.currentTarget.style.color='hsl(var(--muted-foreground))'; }}}
    >
      {copied
        ? <><CheckIcon/>복사됨</>
        : <><CopyIcon/>복사</>
      }
    </button>
  );
}

function CopyIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
      <polyline points="20 6 9 17 4 12"/>
    </svg>
  );
}

/* 부가 기능 버튼들 — hover 시 표시 */
function MoreActions({ msg, onDelete, onEdit, onFeedback }) {
  const [show, setShow]       = useState(false);
  const [editing, setEditing] = useState(false);
  const [editVal, setEditVal] = useState(msg.content);

  const handleEdit = async () => {
    if (!editVal.trim() || editVal === msg.content) { setEditing(false); return; }
    await onEdit(msg.id, editVal);
    setEditing(false);
  };

  const share = async () => {
    const r = await fetch('/api/share', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message_content: msg.content, title: msg.content.slice(0,40) }),
    });
    const d = await r.json();
    navigator.clipboard.writeText(window.location.origin + d.url);
  };

  if (editing) return (
    <div style={{marginTop:8,width:'100%'}}>
      <textarea value={editVal} onChange={e=>setEditVal(e.target.value)} autoFocus
        style={{width:'100%',padding:'8px 10px',border:'1px solid hsl(var(--border))',borderRadius:8,fontSize:13,fontFamily:'inherit',background:'hsl(var(--background))',color:'hsl(var(--foreground))',resize:'vertical',minHeight:80,outline:'none',boxSizing:'border-box'}}/>
      <div style={{display:'flex',gap:6,marginTop:6}}>
        <button onClick={handleEdit} style={{padding:'5px 12px',border:'none',borderRadius:7,background:'hsl(var(--primary))',color:'hsl(var(--primary-foreground))',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>저장</button>
        <button onClick={()=>{setEditing(false);setEditVal(msg.content);}} style={{padding:'5px 12px',border:'none',borderRadius:7,background:'hsl(var(--muted))',color:'hsl(var(--foreground))',fontSize:12,cursor:'pointer',fontFamily:'inherit'}}>취소</button>
      </div>
    </div>
  );

  const btnStyle = {
    padding:'4px 8px', borderRadius:6,
    border:'1px solid hsl(var(--border))',
    background:'hsl(var(--background))',
    color:'hsl(var(--muted-foreground))',
    fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
    transition:'all .1s',
  };

  return (
    <div style={{position:'relative',display:'inline-flex',alignItems:'center'}}
      onMouseEnter={()=>setShow(true)}
      onMouseLeave={()=>setShow(false)}
    >
      <button style={{...btnStyle,display:'flex',alignItems:'center',gap:2}}
        onMouseEnter={e=>{e.currentTarget.style.background='hsl(var(--muted))';e.currentTarget.style.color='hsl(var(--foreground))';}}
        onMouseLeave={e=>{e.currentTarget.style.background='hsl(var(--background))';e.currentTarget.style.color='hsl(var(--muted-foreground))';}}
      >
        <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="19" cy="12" r="2"/></svg>
      </button>

      {show && msg.id && (
        <div style={{
          position:'absolute', bottom:'100%', left:0, marginBottom:4,
          display:'flex', gap:4, background:'hsl(var(--background))',
          border:'1px solid hsl(var(--border))', borderRadius:8,
          padding:'4px 6px', boxShadow:'0 4px 16px rgba(0,0,0,.12)',
          whiteSpace:'nowrap', zIndex:10,
        }}>
          {onFeedback && <>
            <SmallBtn label="긍정" color="#16a34a" onClick={()=>onFeedback(msg,'positive')}/>
            <SmallBtn label="부정" color="#dc2626" onClick={()=>onFeedback(msg,'negative')}/>
            <div style={{width:1,background:'hsl(var(--border))',margin:'0 2px'}}/>
          </>}
          {onEdit && <SmallBtn label="수정" onClick={()=>setEditing(true)}/>}
          <SmallBtn label="링크 복사" onClick={share}/>
          <SmallBtn label="삭제" color="#dc2626" onClick={()=>onDelete(msg.id)}/>
        </div>
      )}
    </div>
  );
}

function SmallBtn({ label, color, onClick }) {
  return (
    <button onClick={onClick} style={{
      padding:'3px 8px', borderRadius:5, border:'none',
      background:'transparent', color: color||'hsl(var(--foreground))',
      fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit',
    }}
      onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
      onMouseLeave={e=>e.currentTarget.style.background='transparent'}
    >{label}</button>
  );
}

function RegenBtn({ onClick }) {
  return (
    <button onClick={onClick} title="답변 재생성" style={{
      display:'flex', alignItems:'center', gap:4, padding:'4px 8px',
      borderRadius:6, border:'1px solid hsl(var(--border))',
      background:'hsl(var(--background))', color:'hsl(var(--muted-foreground))',
      fontSize:11, fontWeight:600, cursor:'pointer', fontFamily:'inherit', transition:'all .15s',
    }}
      onMouseEnter={e=>{e.currentTarget.style.background='hsl(var(--muted))';e.currentTarget.style.color='hsl(var(--foreground))';}}
      onMouseLeave={e=>{e.currentTarget.style.background='hsl(var(--background))';e.currentTarget.style.color='hsl(var(--muted-foreground))';}}
    >
      <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 .49-4.5"/></svg>
      재생성
    </button>
  );
}

const _COLUMN_PATTERN = /컬럼명|영문약어|데이터.?타입|PAY_AMT|RRNO|NUMERIC|CHAR\(|VARCHAR/i;
function _hasColumnInfo(content) {
  return _COLUMN_PATTERN.test(content);
}

function QualityBadge({ q }) {
  const cfg = q.grade === 'high'
    ? { color:'#16a34a', label:`DB 근거 ${q.std_count}건` }
    : q.grade === 'medium'
    ? { color:'#d97706', label:`참고 ${q.total_sources}건` }
    : { color:'#dc2626', label:'DB 근거 없음' };
  return (
    <span style={{ fontSize:11, padding:'2px 8px', borderRadius:99, background:cfg.color+'15', color:cfg.color, fontWeight:600, border:`1px solid ${cfg.color}30` }}>
      {cfg.label}
    </span>
  );
}

export default function Message({ msg, onOpenSource, compareType, convId, onDelete, onEdit, onFeedback, onRegenerate, onExtractColumns }) {
  const bubbleRef = useRef(null);
  const [open, setOpen] = useState(false);

  const isUser   = msg.role === 'user';
  const isClaude = msg.isClaude;
  const isQ27    = compareType === 'qwen27' && isClaude;

  // 스트리밍 완료 후 인용 링크 추가
  useEffect(() => {
    if (isUser || !bubbleRef.current || msg.streaming) return;
    renderMermaidInEl(bubbleRef.current);
    if (msg.sources?.length) addInlineCitations(bubbleRef.current, msg.sources, onOpenSource);
  }, [msg.streaming, msg.sources]);

  /* 사용자 메시지 */
  if (isUser) return (
    <div className="msg-anim" style={{ display:'flex', justifyContent:'flex-end', padding:'3px 0', flexDirection:'column', alignItems:'flex-end', gap:4 }}>
      <div className="aui-user-bubble">{msg.content}</div>
      {msg.id && (
        <div style={{ display:'flex', gap:4, alignItems:'center' }}>
          <CopyBtn text={msg.content}/>
          {onDelete && (
            <MoreActions msg={msg} onDelete={onDelete} onEdit={onEdit} onFeedback={null}/>
          )}
        </div>
      )}
    </div>
  );

  /* AI 메시지 */
  return (
    <div className="msg-anim" style={{ display:'flex', gap:10, alignItems:'flex-start', padding:'6px 0' }}>
      <Avatar role={msg.role} isClaude={isClaude} isQ27={isQ27} />
      <div style={{ minWidth:0, flex:1, paddingTop:2 }}>
        {msg.status && !msg.content && (
          <p style={{ color:'hsl(var(--muted-foreground))', fontSize:'.8125rem' }}>{msg.status}</p>
        )}
        <div
          className="aui-bot-bubble"
          ref={bubbleRef}
          style={msg.streaming && !msg.content ? undefined : undefined}
        >
          {msg.streaming && !msg.content && (
            <span style={{color:'hsl(var(--muted-foreground))',fontSize:13}}>응답 생성 중...</span>
          )}
          {msg.content && (
            <span style={{whiteSpace:'pre-wrap'}}>{msg.content}{msg.streaming ? '▌' : ''}</span>
          )}
        </div>
        {!msg.streaming && msg.content && (
          <div style={{ marginTop:8, display:'flex', alignItems:'center', gap:6, flexWrap:'wrap' }}>
            <CopyBtn text={msg.content}/>
            {onRegenerate && <RegenBtn onClick={onRegenerate}/>}
            <ExportMenu content={msg.content} title="챗봇 답변"/>
            {msg.quality && <QualityBadge q={msg.quality}/>}
            {onExtractColumns && _hasColumnInfo(msg.content) && (
              <button onClick={()=>onExtractColumns(msg.content)}
                style={{padding:'4px 8px',borderRadius:6,border:'1px solid #2563eb30',background:'#2563eb10',color:'#2563eb',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                설계서 추출
              </button>
            )}
            {onDelete && (
              <MoreActions msg={msg} onDelete={onDelete} onEdit={onEdit} onFeedback={onFeedback}/>
            )}
          </div>
        )}
        {msg.sources?.length > 0 && (
          <div className="sources-wrap">
            <button className={`sources-toggle${open ? ' open' : ''}`} onClick={() => setOpen(o=>!o)}>
              <span className="arrow">▶</span> 참고 출처 {msg.sources.length}건
            </button>
            {open && (
              <div className="sources-list show">
                {msg.sources.map((s,i) => (
                  <span key={i} className="source-tag" role="button" tabIndex={0}
                    onClick={() => onOpenSource(s)} onKeyDown={e=>e.key==='Enter'&&onOpenSource(s)}>
                    {s.source}: {s.title}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
