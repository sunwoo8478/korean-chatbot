import { useState, useEffect, useRef, useCallback } from 'react';
import { XIcon, SearchIcon } from 'lucide-react';

const TYPE_LABEL = { term:'공통표준용어', word:'공통표준단어', domain:'공통표준도메인', dict:'표준국어대사전' };
const TYPE_COLOR = { term:'#2563eb', word:'#059669', domain:'#7c3aed', dict:'#b45309' };

const TERM_COLS   = ['name','abbr','domain','desc'];
const WORD_COLS   = ['name','abbr','domain','desc'];
const DOMAIN_COLS = ['name','abbr','domain','desc'];
const COL_LABEL   = { name:'이름', abbr:'약어/품사', domain:'도메인/어원', desc:'설명/뜻풀이' };

export default function QuickSearchModal({ onClose }) {
  const [q, setQ]             = useState('');
  const [results, setResults] = useState(null);
  const [selected, setSelected] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeType, setActiveType] = useState('all');
  const [mode, setMode] = useState('title');
  const inputRef = useRef(null);
  const debounceRef = useRef(null);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const search = useCallback(async (query, searchMode) => {
    if (!query.trim()) { setResults(null); return; }
    setLoading(true);
    const r = await fetch(`/api/admin/search-all?q=${encodeURIComponent(query)}&mode=${searchMode}`);
    const data = await r.json();
    setResults(data);
    setActiveType('all');
    setSelected(null);
    setLoading(false);
  }, []);

  useEffect(() => {
    clearTimeout(debounceRef.current);
    if (q.length >= 1) {
      debounceRef.current = setTimeout(() => search(q, mode), 200);
    } else {
      setResults(null);
    }
    return () => clearTimeout(debounceRef.current);
  }, [q, mode, search]);

  const allRows = results
    ? [
        ...results.terms.map(r => ({...r, _type:'term'})),
        ...results.words.map(r => ({...r, _type:'word'})),
        ...results.domains.map(r => ({...r, _type:'domain'})),
        ...(results.dict||[]).map(r => ({...r, _type:'dict'})),
      ]
    : [];

  const filtered = activeType === 'all'
    ? allRows
    : allRows.filter(r => r._type === activeType);

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(3px)',zIndex:500,display:'flex',alignItems:'flex-start',justifyContent:'center',paddingTop:80 },
    modal:   { background:'hsl(var(--background))',borderRadius:14,width:820,maxWidth:'95vw',maxHeight:'78vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.2)',overflow:'hidden' },
    tab:     (a) => ({ padding:'5px 14px',border:'none',background:a?'hsl(var(--primary))':'transparent',color:a?'hsl(var(--primary-foreground))':'hsl(var(--muted-foreground))',fontSize:12,fontWeight:600,cursor:'pointer',fontFamily:'inherit',borderRadius:'6px 6px 0 0',whiteSpace:'nowrap' }),
    th:      { padding:'8px 12px',textAlign:'left',fontWeight:600,fontSize:11,color:'hsl(var(--muted-foreground))',whiteSpace:'nowrap',background:'hsl(var(--muted))' },
    td:      { padding:'7px 12px',fontSize:12.5,borderTop:'1px solid hsl(var(--border))',maxWidth:220,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' },
  };

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.modal}>
        {/* 검색창 */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid hsl(var(--border))'}}>
          <div style={{display:'flex',alignItems:'center',gap:10}}>
            <SearchIcon size={16} style={{color:'hsl(var(--muted-foreground))',flexShrink:0}}/>
            <input
              ref={inputRef}
              style={{flex:1,border:'none',outline:'none',fontSize:15,background:'transparent',color:'hsl(var(--foreground))',fontFamily:'inherit'}}
              placeholder="용어명, 영문약어, 도메인명 통합 검색..."
              value={q}
              onChange={e=>setQ(e.target.value)}
              onKeyDown={e=>e.key==='Escape'&&onClose()}
            />
            {loading && <span style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>검색 중...</span>}
            <div style={{display:'flex',border:'1px solid hsl(var(--border))',borderRadius:7,overflow:'hidden',flexShrink:0}}>
              {[['title','제목'],['content','내용'],['all','전체']].map(([v,l])=>(
                <button key={v} onClick={()=>setMode(v)}
                  style={{padding:'4px 10px',border:'none',borderRight:v!=='all'?'1px solid hsl(var(--border))':'none',background:mode===v?'hsl(var(--primary))':'transparent',color:mode===v?'hsl(var(--primary-foreground))':'hsl(var(--muted-foreground))',fontSize:11,fontWeight:600,cursor:'pointer',fontFamily:'inherit'}}>
                  {l}
                </button>
              ))}
            </div>
            <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'hsl(var(--muted-foreground))',display:'flex'}}><XIcon size={16}/></button>
          </div>
        </div>

        {/* 필터 탭 */}
        {results && (
          <div style={{display:'flex',gap:2,padding:'8px 16px 0',borderBottom:'1px solid hsl(var(--border))',flexShrink:0,alignItems:'center'}}>
            <button style={s.tab(activeType==='all')} onClick={()=>setActiveType('all')}>
              전체 {results.total}건
            </button>
            {results.terms.length > 0 && (
              <button style={s.tab(activeType==='term')} onClick={()=>setActiveType('term')}>
                용어 {results.terms.length}건
              </button>
            )}
            {results.words.length > 0 && (
              <button style={s.tab(activeType==='word')} onClick={()=>setActiveType('word')}>
                단어 {results.words.length}건
              </button>
            )}
            {results.domains.length > 0 && (
              <button style={s.tab(activeType==='domain')} onClick={()=>setActiveType('domain')}>
                도메인 {results.domains.length}건
              </button>
            )}
            {results.dict?.length > 0 && (
              <button style={s.tab(activeType==='dict')} onClick={()=>setActiveType('dict')}>
                표준국어대사전 {results.dict.length}건{results.dict.length===200?'+':''}
              </button>
            )}
          </div>
        )}

        {/* 결과 영역 */}
        <div style={{flex:1,overflowY:'auto',display:'flex',minHeight:0}}>
          <div style={{flex:1,overflowY:'auto'}}>
            {!results && !loading && (
              <p style={{padding:24,textAlign:'center',color:'hsl(var(--muted-foreground))',fontSize:13}}>검색어를 입력하면 용어·단어·도메인을 통합 검색합니다</p>
            )}
            {results && filtered.length === 0 && (
              <p style={{padding:24,textAlign:'center',color:'hsl(var(--muted-foreground))',fontSize:13}}>검색 결과 없음</p>
            )}
            {filtered.length > 0 && (
              <table style={{width:'100%',borderCollapse:'collapse'}}>
                <thead>
                  <tr>
                    <th style={s.th}>구분</th>
                    <th style={s.th}>이름</th>
                    <th style={s.th}>약어/타입</th>
                    <th style={s.th}>도메인/길이</th>
                    <th style={s.th}>설명</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((row, i) => (
                    <tr key={i}
                      style={{cursor:'pointer',background:selected===i?'hsl(var(--primary)/0.06)':'transparent',transition:'background .1s'}}
                      onClick={()=>setSelected(i===selected?null:i)}
                      onMouseEnter={e=>{ if(selected!==i) e.currentTarget.style.background='hsl(var(--muted))'; }}
                      onMouseLeave={e=>{ if(selected!==i) e.currentTarget.style.background='transparent'; }}>
                      <td style={s.td}>
                        <span style={{padding:'2px 8px',borderRadius:99,fontSize:10,fontWeight:700,background:(TYPE_COLOR[row._type]||'#6b7280')+'18',color:TYPE_COLOR[row._type]||'#6b7280'}}>
                          {TYPE_LABEL[row._type]}
                        </span>
                      </td>
                      <td style={{...s.td,fontWeight:600}} title={row.name||''}>{row.name||'-'}</td>
                      <td style={s.td} title={row.abbr||''}>{row.abbr||'-'}</td>
                      <td style={s.td} title={row.domain||''}>{row.domain||'-'}</td>
                      <td style={s.td} title={row.desc||''}>{row.desc||'-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* 선택 상세 */}
          {selected !== null && filtered[selected] && (
            <div style={{width:260,borderLeft:'1px solid hsl(var(--border))',padding:16,flexShrink:0,overflowY:'auto',background:'hsl(var(--muted)/0.3)'}}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:14}}>
                <span style={{padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700,background:(TYPE_COLOR[filtered[selected]._type])+'18',color:TYPE_COLOR[filtered[selected]._type]}}>
                  {TYPE_LABEL[filtered[selected]._type]}
                </span>
                <span style={{fontSize:14,fontWeight:700}}>{filtered[selected].name}</span>
              </div>
              {Object.entries(filtered[selected]).filter(([k])=>k!=='_type'&&k!=='type'&&k!=='id').map(([k,v])=>(
                <div key={k} style={{marginBottom:12}}>
                  <p style={{fontSize:10,fontWeight:700,color:'hsl(var(--muted-foreground))',marginBottom:3,textTransform:'uppercase',letterSpacing:.4}}>{COL_LABEL[k]||k}</p>
                  <p style={{fontSize:12,wordBreak:'break-all',lineHeight:1.5}}>{v===null||v===''?<span style={{color:'hsl(var(--muted-foreground))'}}>-</span>:String(v)}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        <div style={{padding:'8px 16px',borderTop:'1px solid hsl(var(--border))',fontSize:11,color:'hsl(var(--muted-foreground))',display:'flex',justifyContent:'space-between',flexShrink:0}}>
          <span>{filtered.length > 0 ? `${filtered.length}건 표시` : ''}</span>
          <span>ESC 닫기 · 행 클릭 상세</span>
        </div>
      </div>
    </div>
  );
}
