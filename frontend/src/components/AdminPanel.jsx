import { useState, useEffect, useCallback, useRef } from 'react';
import { XIcon, SearchIcon, TrashIcon, PlusIcon, EditIcon, CheckIcon, RefreshCwIcon, ThumbsUpIcon, ThumbsDownIcon } from 'lucide-react';

const TABS = [
  { key: 'dashboard', label: '대시보드' },
  { key: 'std',       label: '공통표준 편집' },
  { key: 'skills',    label: '스킬 관리' },
  { key: 'rag',       label: 'RAG 테스트' },
  { key: 'prompt',    label: '프롬프트 편집' },
  { key: 'model',     label: '모델 설정' },
  { key: 'feedback',  label: '피드백' },
  { key: 'docs',      label: '문서 관리' },
  { key: 'stats',     label: '사용 통계' },
  { key: 'chats',     label: '채팅 관리' },
  { key: 'logs',      label: '로그' },
  { key: 'history',   label: '변경 이력' },
  { key: 'report',    label: 'DB 리포트' },
  { key: 'users',     label: '사용자 관리' },
  { key: 'system',    label: '시스템' },
];

const S = {
  overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.55)',backdropFilter:'blur(4px)',zIndex:600,display:'flex',alignItems:'center',justifyContent:'center' },
  panel:   { background:'hsl(var(--background))',borderRadius:16,width:1060,maxWidth:'97vw',height:'90vh',display:'flex',flexDirection:'column',boxShadow:'0 24px 80px rgba(0,0,0,.3)',overflow:'hidden' },
  head:    { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 24px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0 },
  tabBar:  { display:'flex',gap:2,padding:'8px 16px 0',borderBottom:'1px solid hsl(var(--border))',flexShrink:0,overflowX:'auto' },
  body:    { flex:1,overflowY:'auto',padding:24,minHeight:0 },
  tab:     (a) => ({ padding:'6px 14px',borderRadius:'7px 7px 0 0',border:'none',background:a?'hsl(var(--primary))':'transparent',color:a?'hsl(var(--primary-foreground))':'hsl(var(--muted-foreground))',fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',whiteSpace:'nowrap',flexShrink:0 }),
  card:    { background:'hsl(var(--muted))',borderRadius:10,padding:'14px 18px',marginBottom:14 },
  input:   { width:'100%',padding:'8px 12px',border:'1px solid hsl(var(--border))',borderRadius:8,fontSize:13,outline:'none',fontFamily:'inherit',background:'hsl(var(--background))',color:'hsl(var(--foreground))',boxSizing:'border-box' },
  textarea:{ width:'100%',padding:'10px 12px',border:'1px solid hsl(var(--border))',borderRadius:8,fontSize:12.5,outline:'none',fontFamily:'monospace',background:'hsl(var(--background))',color:'hsl(var(--foreground))',resize:'vertical',boxSizing:'border-box' },
  btn:     (bg,col='#fff') => ({ padding:'7px 16px',borderRadius:8,border:'none',background:bg,color:col,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5 }),
  badge:   (c) => ({ display:'inline-block',padding:'2px 8px',borderRadius:99,fontSize:11,fontWeight:700,background:c+'20',color:c }),
  th:      { padding:'9px 14px',textAlign:'left',fontWeight:600,fontSize:12,whiteSpace:'nowrap' },
  td:      { padding:'8px 14px',fontSize:12.5,borderTop:'1px solid hsl(var(--border))' },
  row:     { cursor:'pointer', transition:'background .12s' },
};

// ── 디테일 패널 ───────────────────────────────────────────────────────────────
function DetailPanel({ detail, onClose }) {
  if (!detail) return null;
  const { title, fields, extra } = detail;
  return (
    <div style={{
      position:'absolute', top:0, right:0, bottom:0, width:380,
      background:'hsl(var(--background))',
      borderLeft:'1px solid hsl(var(--border))',
      display:'flex', flexDirection:'column',
      boxShadow:'-8px 0 32px rgba(0,0,0,.12)',
      zIndex:10, animation:'slideInRight .18s ease',
    }}>
      <style>{`@keyframes slideInRight { from { transform:translateX(30px); opacity:0 } to { transform:translateX(0); opacity:1 } }`}</style>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 18px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0}}>
        <h3 style={{fontSize:14,fontWeight:700}}>{title}</h3>
        <button onClick={onClose} style={{border:'none',background:'none',cursor:'pointer',color:'hsl(var(--muted-foreground))',padding:4,display:'flex'}}><XIcon size={15}/></button>
      </div>
      <div style={{flex:1,overflowY:'auto',padding:18}}>
        {fields?.map(([label, value], i) => (
          <div key={i} style={{marginBottom:14}}>
            <p style={{fontSize:11,fontWeight:700,color:'hsl(var(--muted-foreground))',marginBottom:4,textTransform:'uppercase',letterSpacing:.4}}>{label}</p>
            {typeof value === 'string' && value.length > 100
              ? <pre style={{fontSize:12,background:'hsl(var(--muted))',padding:'8px 10px',borderRadius:7,whiteSpace:'pre-wrap',wordBreak:'break-all',margin:0}}>{value||'-'}</pre>
              : <p style={{fontSize:13,wordBreak:'break-all'}}>{value===null||value===undefined||value===''?<span style={{color:'hsl(var(--muted-foreground))'}}>-</span>:String(value)}</p>
            }
          </div>
        ))}
        {extra}
      </div>
    </div>
  );
}

export default function AdminPanel({ onClose }) {
  const [tab, setTab] = useState('dashboard');
  const [detail, setDetail] = useState(null);

  return (
    <div style={S.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{...S.panel, position:'relative'}}>
        <div style={S.head}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700}}>관리자 패널</h2>
            <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:1}}>NT Sys 챗봇 통합 관리</p>
          </div>
          <button onClick={onClose} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}>
            <XIcon size={15}/>
          </button>
        </div>
        <div style={S.tabBar}>
          {TABS.map(t=><button key={t.key} style={S.tab(tab===t.key)} onClick={()=>{setTab(t.key);setDetail(null);}}>{t.label}</button>)}
        </div>
        <div style={{...S.body, paddingRight: detail ? 400 : 24}}>
          {tab==='dashboard' && <Dashboard onDetail={setDetail}/>}
          {tab==='std'       && <StdEdit   onDetail={setDetail}/>}
          {tab==='skills'    && <SkillsAdmin onDetail={setDetail}/>}
          {tab==='rag'       && <RagTest   onDetail={setDetail}/>}
          {tab==='prompt'    && <PromptEdit/>}
          {tab==='model'     && <ModelConfig/>}
          {tab==='feedback'  && <Feedback  onDetail={setDetail}/>}
          {tab==='docs'      && <DocsManage onDetail={setDetail}/>}
          {tab==='stats'     && <Stats     onDetail={setDetail}/>}
          {tab==='chats'     && <Chats     onDetail={setDetail}/>}
          {tab==='logs'      && <Logs      onDetail={setDetail}/>}
          {tab==='history'   && <ChangeHistory onDetail={setDetail}/>}
          {tab==='report'    && <DBReport/>}
          {tab==='users'     && <UserManage/>}
          {tab==='system'    && <SystemInfo/>}
        </div>
        <DetailPanel detail={detail} onClose={()=>setDetail(null)}/>
      </div>
    </div>
  );
}

// ── 공통 컴포넌트 ─────────────────────────────────────────────────────────────
function Loading() { return <div style={{textAlign:'center',padding:'40px',color:'hsl(var(--muted-foreground))',fontSize:13}}>불러오는 중...</div>; }
function SectionTitle({children}) { return <h3 style={{fontSize:14,fontWeight:700,marginBottom:12}}>{children}</h3>; }

// ── 대시보드 ──────────────────────────────────────────────────────────────────
function Dashboard({ onDetail }) {
  const [d, setD] = useState(null);
  useEffect(()=>{ fetch('/api/admin/stats').then(r=>r.json()).then(setD); },[]);
  if (!d) return <Loading/>;
  const TBL = {std_term:'공통표준용어',std_word:'공통표준단어',std_domain:'공통표준도메인',dict_senses:'표준국어대사전',user_doc_chunks:'업로드문서'};
  return (
    <div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10,marginBottom:20}}>
        {Object.entries(d.models).map(([n,s])=>(
          <div key={n} style={{...S.card,cursor:'pointer'}} onClick={()=>onDetail({title:n+' 모델 상태',fields:[['상태',s],['엔드포인트',n.includes('35')?'http://localhost:8082':'http://localhost:8083'],['확인시각',new Date().toLocaleString('ko-KR')]]})}>
            <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>{n}</p>
            <span style={S.badge(s==='정상'?'#16a34a':'#dc2626')}>{s}</span>
          </div>
        ))}
        <div style={{...S.card,cursor:'pointer'}} onClick={()=>onDetail({title:'대화 통계',fields:[['총 세션',d.conversations.conv_count+'개'],['총 질문',d.conversations.msg_count+'건'],['세션당 평균 질문',d.conversations.msg_count&&d.conversations.conv_count?Math.round(d.conversations.msg_count/d.conversations.conv_count)+'건':'-']]})}><p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>총 대화</p><p style={{fontSize:20,fontWeight:700}}>{d.conversations.conv_count}<span style={{fontSize:11,marginLeft:3}}>세션</span></p></div>
        <div style={{...S.card,cursor:'pointer'}} onClick={()=>onDetail({title:'질문 통계',fields:[['총 질문 수',d.conversations.msg_count+'건'],['피드백 긍정',d.feedback?.positive+'건'],['피드백 부정',d.feedback?.negative+'건']]})}><p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>총 질문</p><p style={{fontSize:20,fontWeight:700}}>{d.conversations.msg_count}<span style={{fontSize:11,marginLeft:3}}>건</span></p></div>
        <div style={{...S.card,cursor:'pointer'}} onClick={()=>onDetail({title:'피드백 현황',fields:[['긍정',d.feedback?.positive+'건'],['부정',d.feedback?.negative+'건'],['총합',(+d.feedback?.positive+ +d.feedback?.negative)+'건']]})}><p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>피드백</p><p style={{fontSize:14,fontWeight:700}}><span style={{color:'#16a34a'}}>긍정 {d.feedback?.positive||0}</span> / <span style={{color:'#dc2626'}}>부정 {d.feedback?.negative||0}</span></p></div>
        <div style={{...S.card,cursor:'pointer'}} onClick={()=>onDetail({title:'응답 성능',fields:[['평균 응답시간',(d.performance?.avg_ms||'-')+'ms'],['최대 응답시간',(d.performance?.max_ms||'-')+'ms'],['24시간 오류',d.performance?.errors+'건']]})}><p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>평균 응답시간</p><p style={{fontSize:20,fontWeight:700}}>{Math.round(d.performance?.avg_ms)||'-'}<span style={{fontSize:11,marginLeft:3}}>ms</span></p></div>
      </div>
      <SectionTitle>DB 임베딩 현황</SectionTitle>
      <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse'}}>
          <thead><tr style={{background:'hsl(var(--muted))'}}>
            {['테이블','전체','임베딩','커버리지'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{d.tables.map((t,i)=>{
            const pct=t.total>0?Math.round(t.embedded/t.total*100):0;
            const missing=t.total-t.embedded;
            return <tr key={t.tbl} style={{...S.row,background:i%2?'hsl(var(--muted)/0.3)':'transparent'}}
              onClick={()=>onDetail({title:TBL[t.tbl]+' 상세',fields:[['테이블명',t.tbl],['전체 레코드',t.total.toLocaleString()+'건'],['임베딩 완료',t.embedded.toLocaleString()+'건'],['임베딩 미완료',missing+'건'],['커버리지',pct+'%'],['상태',pct===100?'완료':'진행 중']]})}
              onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--primary)/0.05)'}
              onMouseLeave={e=>e.currentTarget.style.background=i%2?'hsl(var(--muted)/0.3)':'transparent'}>
              <td style={S.td}>{TBL[t.tbl]||t.tbl}</td>
              <td style={S.td}>{t.total.toLocaleString()}</td>
              <td style={S.td}>{t.embedded.toLocaleString()}</td>
              <td style={S.td}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <div style={{flex:1,height:5,background:'hsl(var(--border))',borderRadius:3}}>
                    <div style={{width:`${pct}%`,height:'100%',background:pct===100?'#16a34a':'#2563eb',borderRadius:3}}/>
                  </div>
                  <span style={{fontSize:11,fontWeight:700,color:pct===100?'#16a34a':'#2563eb',minWidth:30}}>{pct}%</span>
                </div>
              </td>
            </tr>;
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 공통표준 편집 ─────────────────────────────────────────────────────────────
function StdEdit({ onDetail }) {
  const [type, setType] = useState('terms');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({});
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    const r = await fetch(`/api/admin/${type}?q=${encodeURIComponent(q)}`);
    setRows(await r.json());
  }, [type, q]);

  useEffect(() => { load(); }, [type]);

  const save = async () => {
    const url = editing ? `/api/admin/${type}/${editing}` : `/api/admin/${type}`;
    const method = editing ? 'PATCH' : 'POST';
    await fetch(url, {method, headers:{'Content-Type':'application/json'}, body:JSON.stringify(form)});
    setEditing(null); setShowAdd(false); setForm({}); load();
  };

  const del = async (id) => {
    if (!confirm('삭제할까요?')) return;
    await fetch(`/api/admin/${type}/${id}`, {method:'DELETE'});
    load();
  };

  const reembed = async (id) => {
    await fetch(`/api/admin/reembed/${type}/${id}`, {method:'POST'});
    load();
  };

  const startEdit = (row) => {
    setEditing(row.id); setShowAdd(false);
    setForm({...row});
  };

  const FIELDS = {
    terms:   [{k:'term_name',l:'용어명*'},{k:'term_abbr',l:'영문약어'},{k:'domain_name',l:'도메인명'},{k:'term_desc',l:'설명'},{k:'admin_code_name',l:'행정코드명'},{k:'org_name',l:'기관명'}],
    words:   [{k:'word_name',l:'단어명*'},{k:'word_abbr',l:'약어'},{k:'word_eng_name',l:'영문명'},{k:'word_desc',l:'설명'},{k:'domain_class_name',l:'도메인분류'}],
    domains: [{k:'domain_name',l:'도메인명*'},{k:'domain_desc',l:'설명'},{k:'data_type',l:'데이터타입'},{k:'data_length',l:'길이'},{k:'data_decimal',l:'소수점'},{k:'storage_format',l:'저장형식'},{k:'display_format',l:'표현형식'}],
  };
  const COL_KEYS = {
    terms:   ['term_name','term_abbr','domain_name','has_embedding'],
    words:   ['word_name','word_abbr','word_eng_name','has_embedding'],
    domains: ['domain_name','data_type','data_length','storage_format','has_embedding'],
  };
  const COL_LABELS = {term_name:'용어명',term_abbr:'영문약어',domain_name:'도메인',word_name:'단어명',word_abbr:'약어',word_eng_name:'영문명',domain_name:'도메인명',data_type:'타입',data_length:'길이',storage_format:'저장형식',has_embedding:'임베딩'};

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14}}>
        {[['terms','용어'],['words','단어'],['domains','도메인']].map(([k,l])=>(
          <button key={k} onClick={()=>{setType(k);setEditing(null);setShowAdd(false);}} style={S.btn(k===type?'hsl(var(--primary))':'hsl(var(--muted))',k===type?'hsl(var(--primary-foreground))':'hsl(var(--foreground))')}>공통표준{l}</button>
        ))}
        <div style={{flex:1}}/>
        <button onClick={()=>{setShowAdd(true);setEditing(null);setForm({});}} style={S.btn('#16a34a')}><PlusIcon size={13}/>신규 추가</button>
      </div>

      {(showAdd || editing) && (
        <div style={{border:'2px solid hsl(var(--primary))',borderRadius:10,padding:16,marginBottom:16,background:'hsl(var(--muted)/0.5)'}}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:12}}>{editing ? '수정' : '신규 추가'}</h4>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10}}>
            {FIELDS[type].map(({k,l})=>(
              <div key={k}>
                <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>{l}</label>
                <input style={S.input} value={form[k]||''} onChange={e=>setForm(f=>({...f,[k]:e.target.value}))}/>
              </div>
            ))}
          </div>
          <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
            <button onClick={()=>{setEditing(null);setShowAdd(false);setForm({});}} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}>취소</button>
            <button onClick={save} style={S.btn('hsl(var(--primary))')}><CheckIcon size={13}/>저장</button>
          </div>
        </div>
      )}

      <div style={{display:'flex',gap:8,marginBottom:12}}>
        <div style={{flex:1,display:'flex',alignItems:'center',gap:8,border:'1px solid hsl(var(--border))',borderRadius:8,padding:'7px 12px'}}>
          <SearchIcon size={13} style={{color:'hsl(var(--muted-foreground))',flexShrink:0}}/>
          <input style={{flex:1,border:'none',outline:'none',background:'transparent',fontSize:13,fontFamily:'inherit',color:'hsl(var(--foreground))'}} placeholder="검색..." value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}/>
        </div>
        <button onClick={load} style={S.btn('hsl(var(--primary))')}>검색</button>
      </div>

      <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'auto',maxHeight:420}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead><tr style={{background:'hsl(var(--muted))',position:'sticky',top:0}}>
            {COL_KEYS[type].map(k=><th key={k} style={S.th}>{COL_LABELS[k]||k}</th>)}
            <th style={S.th}>작업</th>
          </tr></thead>
          <tbody>{rows.length===0?<tr><td colSpan={10} style={{padding:32,textAlign:'center',color:'hsl(var(--muted-foreground))'}}>결과 없음</td></tr>:rows.map(row=>(
            <tr key={row.id} style={{...S.row,background:editing===row.id?'hsl(var(--primary)/0.05)':'transparent'}}
              onClick={()=>onDetail({title:row[Object.keys(row)[1]]||'상세',fields:Object.entries(row).map(([k,v])=>[k,v])})}
              onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--primary)/0.05)'}
              onMouseLeave={e=>e.currentTarget.style.background=editing===row.id?'hsl(var(--primary)/0.05)':'transparent'}>
              {COL_KEYS[type].map(k=><td key={k} style={{...S.td,maxWidth:180,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={String(row[k]||'')}>
                {k==='has_embedding'?<span style={S.badge(row[k]?'#16a34a':'#dc2626')}>{row[k]?'완료':'없음'}</span>:row[k]||'-'}
              </td>)}
              <td style={S.td}>
                <div style={{display:'flex',gap:4}}>
                  <button onClick={()=>startEdit(row)} style={{...S.btn('hsl(var(--muted))','hsl(var(--foreground))'),padding:'3px 8px',fontSize:11}}>수정</button>
                  {!row.has_embedding&&<button onClick={()=>reembed(row.id)} style={{...S.btn('#d97706'),padding:'3px 8px',fontSize:11}}>임베딩</button>}
                  <button onClick={()=>del(row.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'3px 8px',fontSize:11}}>삭제</button>
                </div>
              </td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:6}}>총 {rows.length}건</p>
    </div>
  );
}

// ── 스킬 관리 ─────────────────────────────────────────────────────────────────
function SkillsAdmin({ onDetail }) {
  const [skills, setSkills] = useState([]);
  const [form, setForm]     = useState({ name:'', description:'', skill_type:'prompt', config:{} });
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  const load = async () => { const r = await fetch('/api/skills'); setSkills(await r.json()); };
  useEffect(()=>{ load(); },[]);

  const save = async () => {
    const url = editing ? `/api/skills/${editing}` : '/api/skills';
    const method = editing ? 'PATCH' : 'POST';
    await fetch(url, { method, headers:{'Content-Type':'application/json'}, body: JSON.stringify(form) });
    setEditing(null); setShowForm(false); setForm({name:'',description:'',skill_type:'prompt',config:{}}); load();
  };
  const toggle = async (id) => { await fetch(`/api/skills/${id}/toggle`,{method:'PATCH'}); load(); };
  const del    = async (id) => { if(!confirm('삭제?')) return; await fetch(`/api/skills/${id}`,{method:'DELETE'}); load(); };
  const startEdit = (s) => { setEditing(s.id); setShowForm(true); setForm({name:s.name,description:s.description,skill_type:s.skill_type,config:s.config||{}}); };

  const TYPE_COLOR = { prompt:'#2563eb', db_query:'#059669', http:'#d97706', code:'#7c3aed' };
  const TYPE_LABEL = { prompt:'프롬프트 주입', db_query:'DB 쿼리', http:'외부 API', code:'AI 생성 코드' };

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:14}}>
        <SectionTitle>스킬 관리</SectionTitle>
        <button onClick={()=>{setShowForm(true);setEditing(null);setForm({name:'',description:'',skill_type:'prompt',config:{}});}} style={S.btn('#16a34a')}><PlusIcon size={13}/>새 스킬</button>
      </div>

      {showForm && (
        <div style={{border:'2px solid hsl(var(--primary))',borderRadius:10,padding:16,marginBottom:16,background:'hsl(var(--muted)/0.5)'}}>
          <h4 style={{fontSize:13,fontWeight:700,marginBottom:12}}>{editing?'스킬 수정':'새 스킬'}</h4>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:10}}>
            <div>
              <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>스킬 이름</label>
              <input style={S.input} value={form.name} onChange={e=>setForm(f=>({...f,name:e.target.value}))}/>
            </div>
            <div>
              <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>타입</label>
              <select style={{...S.input,cursor:'pointer'}} value={form.skill_type} onChange={e=>setForm(f=>({...f,skill_type:e.target.value,config:{}}))}>
                <option value="prompt">프롬프트 주입</option>
                <option value="db_query">DB 쿼리</option>
                <option value="http">외부 API</option>
              </select>
            </div>
          </div>
          <div style={{marginBottom:10}}>
            <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>설명</label>
            <textarea style={{...S.textarea,minHeight:60}} value={form.description} onChange={e=>setForm(f=>({...f,description:e.target.value}))}/>
          </div>
          {form.skill_type==='prompt'&&(
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>주입 내용</label>
              <textarea style={{...S.textarea,minHeight:80}} value={form.config.content||''} onChange={e=>setForm(f=>({...f,config:{...f.config,content:e.target.value}}))}/>
            </div>
          )}
          {form.skill_type==='db_query'&&(
            <div style={{marginBottom:10}}>
              <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>SQL 쿼리</label>
              <textarea style={{...S.textarea,fontFamily:'monospace',minHeight:80}} value={form.config.sql||''} onChange={e=>setForm(f=>({...f,config:{...f.config,sql:e.target.value}}))}/>
            </div>
          )}
          {form.skill_type==='http'&&(
            <div style={{display:'grid',gridTemplateColumns:'1fr auto',gap:10,marginBottom:10}}>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>URL</label>
                <input style={S.input} value={form.config.url||''} onChange={e=>setForm(f=>({...f,config:{...f.config,url:e.target.value}}))}/>
              </div>
              <div>
                <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:3}}>메서드</label>
                <select style={{...S.input,cursor:'pointer'}} value={form.config.method||'GET'} onChange={e=>setForm(f=>({...f,config:{...f.config,method:e.target.value}}))}>
                  <option value="GET">GET</option><option value="POST">POST</option>
                </select>
              </div>
            </div>
          )}
          <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
            <button onClick={()=>{setShowForm(false);setEditing(null);}} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}>취소</button>
            <button onClick={save} style={S.btn('hsl(var(--primary))')}><CheckIcon size={13}/>저장</button>
          </div>
        </div>
      )}

      {skills.length===0&&!showForm?<p style={{textAlign:'center',padding:32,color:'hsl(var(--muted-foreground))',fontSize:13}}>등록된 스킬 없음</p>:(
        skills.map(sk=>(
          <div key={sk.id} style={{border:'1px solid hsl(var(--border))',borderRadius:10,marginBottom:8,overflow:'hidden',cursor:'pointer'}}
            onClick={()=>onDetail({title:sk.name,fields:[['타입',TYPE_LABEL[sk.skill_type]],['설명',sk.description],['상태',sk.is_active?'활성':'비활성'],['설정',JSON.stringify(sk.config,null,2)],['생성코드',sk.generated_code||'-']]})}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'11px 14px'}}>
              <span style={{width:8,height:8,borderRadius:'50%',background:sk.is_active?'#16a34a':'hsl(var(--border))',flexShrink:0}}/>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:8}}>
                  <span style={{fontWeight:600,fontSize:13}}>{sk.name}</span>
                  <span style={S.badge(TYPE_COLOR[sk.skill_type]||'#6b7280')}>{TYPE_LABEL[sk.skill_type]||sk.skill_type}</span>
                </div>
                <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:2,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{sk.description}</p>
              </div>
              <div style={{display:'flex',gap:4}}>
                <button onClick={()=>toggle(sk.id)} style={{...S.btn(sk.is_active?'#16a34a':'hsl(var(--muted))',sk.is_active?'#fff':'hsl(var(--foreground))'),padding:'4px 10px',fontSize:11}}>{sk.is_active?'활성':'비활성'}</button>
                <button onClick={()=>startEdit(sk)} style={{...S.btn('hsl(var(--muted))','hsl(var(--foreground))'),padding:'4px 10px',fontSize:11}}>수정</button>
                <button onClick={()=>del(sk.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'4px 10px',fontSize:11}}>삭제</button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

// ── RAG 테스트 ────────────────────────────────────────────────────────────────
function RagTest({ onDetail }) {
  const [q, setQ] = useState('');
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(false);

  const test = async () => {
    if (!q.trim()) return;
    setLoading(true);
    const r = await fetch('/api/admin/rag-test', {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({query:q})});
    setResult(await r.json());
    setLoading(false);
  };

  return (
    <div>
      <SectionTitle>RAG 검색 테스트</SectionTitle>
      <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:12}}>질문을 입력하면 실제 RAG가 어떤 데이터를 찾는지 확인합니다. 답변 품질 디버깅에 활용하세요.</p>
      <div style={{display:'flex',gap:8,marginBottom:16}}>
        <input style={{...S.input,flex:1}} placeholder="예: 납부금액 영문약어 알려줘" value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&test()}/>
        <button onClick={test} disabled={loading} style={S.btn('hsl(var(--primary))')}>{loading?'검색 중...':'검색'}</button>
      </div>
      {result && <>
        <div style={{display:'flex',gap:10,marginBottom:16}}>
          {[['정확 매칭',result.exact_count,'#2563eb'],['벡터 검색',result.vector_count,'#7c3aed'],['최종 사용',result.final_count,'#16a34a']].map(([l,c,col])=>(
            <div key={l} style={{...S.card,flex:1,marginBottom:0,textAlign:'center'}}>
              <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:4}}>{l}</p>
              <p style={{fontSize:24,fontWeight:700,color:col}}>{c}</p>
            </div>
          ))}
        </div>
        <SectionTitle>검색된 문서 목록</SectionTitle>
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden',marginBottom:16}}>
          {result.docs.map((d,i)=>(
            <div key={i} style={{padding:'10px 14px',borderBottom:'1px solid hsl(var(--border))',fontSize:12,cursor:'pointer'}}
              onClick={()=>onDetail({title:d.title,fields:[['출처',d.source],['유사도',d.score],['내용',d.content]]})}
              onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{display:'flex',alignItems:'center',gap:8,marginBottom:4}}>
                <span style={S.badge('#2563eb')}>{d.source}</span>
                <span style={{fontWeight:600}}>{d.title}</span>
                <span style={{marginLeft:'auto',color:'hsl(var(--muted-foreground))'}}>유사도 {d.score}</span>
              </div>
              <p style={{color:'hsl(var(--muted-foreground))',fontSize:11}}>{d.content}</p>
            </div>
          ))}
        </div>
        <SectionTitle>생성된 컨텍스트</SectionTitle>
        <pre style={{background:'hsl(var(--muted))',padding:'14px 16px',borderRadius:10,fontSize:11,overflow:'auto',maxHeight:300,whiteSpace:'pre-wrap'}}>{result.context}</pre>
      </>}
    </div>
  );
}

// ── 프롬프트 편집 ─────────────────────────────────────────────────────────────
function PromptEdit() {
  const [data, setData] = useState(null);
  const [val, setVal] = useState('');
  const [saved, setSaved] = useState(false);

  useEffect(()=>{ fetch('/api/admin/prompt').then(r=>r.json()).then(d=>{setData(d);setVal(d.override||d.default);}); },[]);

  const save = async () => {
    await fetch('/api/admin/prompt',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({prompt:val})});
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };
  const reset = async () => {
    if (!confirm('기본 프롬프트로 되돌릴까요?')) return;
    await fetch('/api/admin/prompt',{method:'DELETE'});
    fetch('/api/admin/prompt').then(r=>r.json()).then(d=>{setData(d);setVal(d.default);});
  };

  if (!data) return <Loading/>;

  return (
    <div>
      <SectionTitle>시스템 프롬프트 편집</SectionTitle>
      <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:12}}>AI의 동작 방식, 답변 규칙, 역할 정의를 직접 수정합니다. 저장 즉시 적용됩니다.</p>
      {data.override && <div style={{background:'#fef9c3',border:'1px solid #fde68a',borderRadius:8,padding:'8px 12px',fontSize:12,marginBottom:12,color:'#92400e'}}>현재 커스텀 프롬프트 사용 중</div>}
      <textarea style={{...S.textarea,minHeight:500,fontSize:12}} value={val} onChange={e=>setVal(e.target.value)}/>
      <div style={{display:'flex',gap:8,marginTop:12,justifyContent:'flex-end'}}>
        <button onClick={reset} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}>기본값으로 복원</button>
        <button onClick={save} style={S.btn(saved?'#16a34a':'hsl(var(--primary))')}>{saved?'저장됨!':'저장'}</button>
      </div>
    </div>
  );
}

// ── 모델 설정 ─────────────────────────────────────────────────────────────────
function ModelConfig() {
  const [cfg, setCfg] = useState(null);
  const [saved, setSaved] = useState(false);

  useEffect(()=>{ fetch('/api/admin/model-config').then(r=>r.json()).then(setCfg); },[]);

  const save = async () => {
    await fetch('/api/admin/model-config',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(cfg)});
    setSaved(true); setTimeout(()=>setSaved(false),2000);
  };

  if (!cfg) return <Loading/>;

  const FIELDS = [
    {k:'temperature',l:'Temperature',desc:'값이 낮을수록 일관된 답변 (0.0~1.0)',min:0,max:1,step:0.05},
    {k:'max_tokens',l:'Max Tokens',desc:'답변 최대 길이',min:512,max:8192,step:256},
    {k:'top_k',l:'Top-K 검색',desc:'RAG에서 가져올 최대 문서 수',min:3,max:20,step:1},
    {k:'similarity_threshold',l:'유사도 임계값',desc:'이 값 이상인 문서만 사용 (0.0~1.0)',min:0.3,max:0.95,step:0.05},
  ];

  return (
    <div>
      <SectionTitle>모델 파라미터 설정</SectionTitle>
      <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginBottom:16}}>변경 사항은 저장 후 최대 30초 내 반영됩니다.</p>
      {FIELDS.map(({k,l,desc,min,max,step})=>(
        <div key={k} style={{...S.card,display:'flex',alignItems:'center',gap:16}}>
          <div style={{flex:1,minWidth:0}}>
            <p style={{fontSize:13,fontWeight:600,marginBottom:2}}>{l}</p>
            <p style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>{desc}</p>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
            <input type="range" min={min} max={max} step={step} value={cfg[k]||0}
              onChange={e=>setCfg(c=>({...c,[k]:e.target.value}))}
              style={{width:140}}/>
            <input type="number" min={min} max={max} step={step} value={cfg[k]||0}
              onChange={e=>setCfg(c=>({...c,[k]:e.target.value}))}
              style={{...S.input,width:80,textAlign:'center'}}/>
          </div>
        </div>
      ))}
      <div style={{display:'flex',justifyContent:'flex-end',marginTop:8}}>
        <button onClick={save} style={S.btn(saved?'#16a34a':'hsl(var(--primary))')}>{saved?'저장됨!':'설정 저장'}</button>
      </div>
    </div>
  );
}

// ── 피드백 ────────────────────────────────────────────────────────────────────
function Feedback({ onDetail }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState(0);
  const load = useCallback(async()=>{
    const url = filter ? `/api/admin/feedback?rating=${filter}` : '/api/admin/feedback';
    const r = await fetch(url);
    setItems(await r.json());
  },[filter]);
  useEffect(()=>{ load(); },[load]);

  const del = async (id)=>{ await fetch(`/api/admin/feedback/${id}`,{method:'DELETE'}); load(); };

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
        <SectionTitle>답변 피드백</SectionTitle>
        <div style={{flex:1}}/>
        {[[0,'전체'],[1,'긍정'],[- 1,'부정']].map(([v,l])=>(
          <button key={v} onClick={()=>setFilter(v)} style={S.btn(filter===v?'hsl(var(--primary))':'hsl(var(--muted))',filter===v?'hsl(var(--primary-foreground))':'hsl(var(--foreground))')}>{l}</button>
        ))}
      </div>
      {items.length===0?<p style={{textAlign:'center',color:'hsl(var(--muted-foreground))',padding:32,fontSize:13}}>피드백 없음</p>:(
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
          {items.map(item=>(
            <div key={item.id} style={{padding:'12px 16px',borderBottom:'1px solid hsl(var(--border))',cursor:'pointer'}}
              onClick={()=>onDetail({title:(item.rating===1?'긍정':'부정')+' 피드백',fields:[['평가',item.rating===1?'긍정':'부정'],['내용',item.message_content],['코멘트',item.comment||'-'],['일시',new Date(item.created_at).toLocaleString('ko-KR')],['대화ID',item.conversation_id||'-']]})}
              onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <div style={{display:'flex',alignItems:'flex-start',gap:10}}>
                <span style={{fontSize:12,fontWeight:700,color:item.rating===1?'#16a34a':'#dc2626',flexShrink:0}}>{item.rating===1?'긍정':'부정'}</span>
                <div style={{flex:1}}>
                  <p style={{fontSize:12.5,marginBottom:4}}>{item.message_content?.slice(0,200)}</p>
                  {item.comment&&<p style={{fontSize:11,color:'hsl(var(--muted-foreground))',fontStyle:'italic'}}>"{item.comment}"</p>}
                  <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:4}}>{new Date(item.created_at).toLocaleString('ko-KR')}</p>
                </div>
                <button onClick={()=>del(item.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'3px 8px',fontSize:11,flexShrink:0}}>삭제</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 문서 관리 ─────────────────────────────────────────────────────────────────
function DocsManage({ onDetail }) {
  const [docs, setDocs] = useState([]);
  const [expanded, setExpanded] = useState(null);
  const [chunks, setChunks] = useState([]);

  const load = async()=>{ const r=await fetch('/api/admin/documents'); setDocs(await r.json()); };
  useEffect(()=>{ load(); },[]);

  const del = async(id)=>{ if(!confirm('삭제?')) return; await fetch(`/api/admin/documents/${id}`,{method:'DELETE'}); load(); };
  const reembed = async(id)=>{ await fetch(`/api/admin/documents/${id}/reembed`,{method:'POST'}); load(); };
  const expand = async(id)=>{
    if(expanded===id){setExpanded(null);return;}
    const r=await fetch(`/api/admin/documents/${id}/chunks`);
    setChunks(await r.json()); setExpanded(id);
  };

  const STATUS_COLOR = {ready:'#16a34a',processing:'#d97706',error:'#dc2626'};

  return (
    <div>
      <SectionTitle>업로드 문서 관리</SectionTitle>
      {docs.length===0?<p style={{textAlign:'center',padding:32,color:'hsl(var(--muted-foreground))',fontSize:13}}>업로드된 문서 없음</p>:(
        docs.map(doc=>(
          <div key={doc.id} style={{border:'1px solid hsl(var(--border))',borderRadius:10,marginBottom:10,overflow:'hidden'}}
            onClick={e=>{ if(e.target.closest('button')) return; onDetail({title:doc.filename,fields:[['파일명',doc.filename],['타입',doc.file_type],['크기',(doc.file_size/1024).toFixed(1)+'KB'],['상태',doc.status],['청크수',doc.chunk_count+'개'],['임베딩',doc.embedded_chunks+'개'],['오류',doc.error_msg||'-'],['업로드일',new Date(doc.created_at).toLocaleString('ko-KR')]]}); }}
            style={{cursor:'pointer'}}>
            <div style={{display:'flex',alignItems:'center',gap:10,padding:'12px 16px'}}>
              <span style={S.badge(STATUS_COLOR[doc.status]||'#6b7280')}>{doc.status}</span>
              <span style={{fontWeight:600,fontSize:13,flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.filename}</span>
              <span style={{fontSize:12,color:'hsl(var(--muted-foreground))'}}>{doc.file_type} · {(doc.file_size/1024).toFixed(1)}KB · {doc.chunk_count}청크 ({doc.embedded_chunks}임베딩)</span>
              <div style={{display:'flex',gap:4}}>
                <button onClick={()=>expand(doc.id)} style={{...S.btn('hsl(var(--muted))','hsl(var(--foreground))'),padding:'4px 10px',fontSize:11}}>청크 보기</button>
                <button onClick={()=>reembed(doc.id)} style={{...S.btn('#d97706'),padding:'4px 10px',fontSize:11}}>재임베딩</button>
                <button onClick={()=>del(doc.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'4px 10px',fontSize:11}}>삭제</button>
              </div>
            </div>
            {expanded===doc.id&&(
              <div style={{borderTop:'1px solid hsl(var(--border))',background:'hsl(var(--muted))',padding:'10px 16px',maxHeight:300,overflowY:'auto'}}>
                {chunks.map(c=>(
                  <div key={c.id} style={{fontSize:11,marginBottom:8,padding:'6px 10px',background:'hsl(var(--background))',borderRadius:6}}>
                    <span style={{fontWeight:600,color:'hsl(var(--muted-foreground))'}}>#{c.chunk_no}</span>
                    {c.page_no&&<span style={{marginLeft:6,color:'hsl(var(--muted-foreground))'}}>p.{c.page_no}</span>}
                    {c.section&&<span style={{marginLeft:6,color:'hsl(var(--muted-foreground))'}}>[{c.section}]</span>}
                    <span style={{...S.badge(c.has_embedding?'#16a34a':'#dc2626'),marginLeft:6}}>{c.has_embedding?'임베딩됨':'없음'}</span>
                    <p style={{marginTop:4,color:'hsl(var(--foreground))'}}>{c.content_preview}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))
      )}
    </div>
  );
}

// ── 사용 통계 ─────────────────────────────────────────────────────────────────
function Stats({ onDetail }) {
  const [queries, setQ] = useState([]);
  const [daily,   setD] = useState([]);
  const [perf,    setP] = useState([]);
  useEffect(()=>{
    fetch('/api/admin/usage/top-queries').then(r=>r.json()).then(setQ);
    fetch('/api/admin/usage/daily').then(r=>r.json()).then(setD);
    fetch('/api/admin/usage/performance').then(r=>r.json()).then(setP);
  },[]);
  return (
    <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:20}}>
      <div>
        <SectionTitle>최근 질문</SectionTitle>
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden',maxHeight:420,overflowY:'auto'}}>
          {queries.map((q,i)=>(
            <div key={i} style={{padding:'9px 14px',borderBottom:'1px solid hsl(var(--border))',fontSize:12,cursor:'pointer'}}
              onClick={()=>onDetail({title:'질문 상세',fields:[['질문',q.question],['일시',new Date(q.created_at).toLocaleString('ko-KR')],['대화ID',q.conversation_id||'-']]})}
              onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <p style={{fontWeight:500,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',marginBottom:2}}>{q.question}</p>
              <p style={{color:'hsl(var(--muted-foreground))',fontSize:11}}>{new Date(q.created_at).toLocaleString('ko-KR')}</p>
            </div>
          ))}
        </div>
      </div>
      <div>
        <SectionTitle>일별 사용량 (30일)</SectionTitle>
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden',maxHeight:200,overflowY:'auto',marginBottom:16}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'hsl(var(--muted))'}}>
              <th style={S.th}>날짜</th><th style={{...S.th,textAlign:'right'}}>질문</th><th style={{...S.th,textAlign:'right'}}>세션</th>
            </tr></thead>
            <tbody>{daily.map((d,i)=>(
              <tr key={i}><td style={S.td}>{d.date}</td>
                <td style={{...S.td,textAlign:'right',fontWeight:600}}>{d.questions}</td>
                <td style={{...S.td,textAlign:'right'}}>{d.sessions}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <SectionTitle>시간별 응답 성능 (24h)</SectionTitle>
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden',maxHeight:200,overflowY:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead><tr style={{background:'hsl(var(--muted))'}}>
              <th style={S.th}>시간</th><th style={{...S.th,textAlign:'right'}}>평균(ms)</th><th style={{...S.th,textAlign:'right'}}>요청</th><th style={{...S.th,textAlign:'right'}}>오류</th>
            </tr></thead>
            <tbody>{perf.map((p,i)=>(
              <tr key={i}><td style={S.td}>{new Date(p.hour).toLocaleString('ko-KR',{hour:'2-digit',minute:'2-digit'})}</td>
                <td style={{...S.td,textAlign:'right'}}>{p.avg_ms}</td>
                <td style={{...S.td,textAlign:'right'}}>{p.requests}</td>
                <td style={{...S.td,textAlign:'right',color:p.errors>0?'#dc2626':'inherit'}}>{p.errors}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── 채팅 관리 ─────────────────────────────────────────────────────────────────
function Chats({ onDetail }) {
  const [convs, setC] = useState([]);
  const [q, setQ]     = useState('');
  const load = useCallback(async()=>{
    const r=await fetch(`/api/admin/conversations?limit=50&q=${encodeURIComponent(q)}`);
    setC(await r.json());
  },[q]);
  useEffect(()=>{ load(); },[]);
  const delAll=async()=>{ if(!confirm('전체 삭제? 복구 불가')) return; await fetch('/api/admin/conversations/all',{method:'DELETE'}); load(); };
  const delOne=async(id)=>{ await fetch(`/api/conversations/${id}`,{method:'DELETE'}); load(); };
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
        <input style={{...S.input,flex:1}} placeholder="제목 검색..." value={q} onChange={e=>setQ(e.target.value)} onKeyDown={e=>e.key==='Enter'&&load()}/>
        <button onClick={load} style={S.btn('hsl(var(--primary))')}>검색</button>
        <button onClick={delAll} style={S.btn('#dc2626')}><TrashIcon size={13}/>전체 삭제</button>
      </div>
      <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
          <thead><tr style={{background:'hsl(var(--muted))'}}>
            {['제목','모델','메시지','마지막 활동',''].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{convs.length===0?<tr><td colSpan={5} style={{padding:32,textAlign:'center',color:'hsl(var(--muted-foreground))'}}>없음</td></tr>:convs.map(c=>(
            <tr key={c.id} style={S.row}
              onClick={e=>{ if(e.target.closest('button')) return; onDetail({title:c.title,fields:[['제목',c.title],['모델',c.model||'qwen'],['메시지수',c.message_count+'건'],['생성일',new Date(c.created_at).toLocaleString('ko-KR')],['마지막활동',new Date(c.updated_at).toLocaleString('ko-KR')],['대화ID',c.id]]}); }}
              onMouseEnter={e=>{ if(!e.target.closest('button')) e.currentTarget.style.background='hsl(var(--muted))'; }}
              onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
              <td style={{...S.td,maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{c.title}</td>
              <td style={S.td}>{c.model||'qwen'}</td>
              <td style={{...S.td,textAlign:'center'}}>{c.message_count}</td>
              <td style={{...S.td,fontSize:11,color:'hsl(var(--muted-foreground))'}}>{new Date(c.updated_at).toLocaleString('ko-KR')}</td>
              <td style={S.td}><button onClick={()=>delOne(c.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'3px 8px',fontSize:11}}>삭제</button></td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 로그 ──────────────────────────────────────────────────────────────────────
function Logs({ onDetail }) {
  const [logs, setLogs] = useState([]);
  const [errOnly, setErrOnly] = useState(false);
  const load = useCallback(async()=>{
    const r=await fetch(`/api/admin/logs?limit=100&errors_only=${errOnly}`);
    setLogs(await r.json());
  },[errOnly]);
  useEffect(()=>{ load(); },[load]);
  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
        <SectionTitle>요청 로그</SectionTitle>
        <div style={{flex:1}}/>
        <button onClick={()=>setErrOnly(false)} style={S.btn(!errOnly?'hsl(var(--primary))':'hsl(var(--muted))',!errOnly?'hsl(var(--primary-foreground))':'hsl(var(--foreground))')}>전체</button>
        <button onClick={()=>setErrOnly(true)} style={S.btn(errOnly?'#dc2626':'hsl(var(--muted))',errOnly?'#fff':'hsl(var(--foreground))')}>오류만</button>
        <button onClick={load} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}><RefreshCwIcon size={13}/></button>
      </div>
      <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden',maxHeight:500,overflowY:'auto'}}>
        <table style={{width:'100%',borderCollapse:'collapse',fontSize:11.5}}>
          <thead><tr style={{background:'hsl(var(--muted))',position:'sticky',top:0}}>
            {['시각','엔드포인트','응답시간','상태','오류'].map(h=><th key={h} style={S.th}>{h}</th>)}
          </tr></thead>
          <tbody>{logs.length===0?<tr><td colSpan={5} style={{padding:32,textAlign:'center',color:'hsl(var(--muted-foreground))'}}>로그 없음</td></tr>:logs.map(l=>(
            <tr key={l.id} style={{...S.row,background:l.error_msg?'#fef2f2':'transparent'}}
              onClick={()=>onDetail({title:l.endpoint+' 로그',fields:[['엔드포인트',l.endpoint],['응답시간',l.duration_ms+'ms'],['상태코드',l.status_code],['오류',l.error_msg||'없음'],['시각',new Date(l.created_at).toLocaleString('ko-KR')]]})}
              onMouseEnter={e=>e.currentTarget.style.background=l.error_msg?'#fecaca':'hsl(var(--muted))'}
              onMouseLeave={e=>e.currentTarget.style.background=l.error_msg?'#fef2f2':'transparent'}>
              <td style={{...S.td,whiteSpace:'nowrap'}}>{new Date(l.created_at).toLocaleString('ko-KR')}</td>
              <td style={{...S.td,fontFamily:'monospace',fontSize:11}}>{l.endpoint}</td>
              <td style={{...S.td,textAlign:'right',color:l.duration_ms>3000?'#dc2626':l.duration_ms>1000?'#d97706':'inherit'}}>{l.duration_ms}ms</td>
              <td style={{...S.td,textAlign:'center'}}><span style={S.badge(l.status_code<400?'#16a34a':'#dc2626')}>{l.status_code}</span></td>
              <td style={{...S.td,color:'#dc2626',fontSize:11,maxWidth:200,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}} title={l.error_msg||''}>{l.error_msg||'-'}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
    </div>
  );
}

// ── 시스템 ────────────────────────────────────────────────────────────────────
// ── 변경 이력 ─────────────────────────────────────────────────────────────────
function ChangeHistory({ onDetail }) {
  const [items, setItems] = useState([]);
  const [tableFilter, setTableFilter] = useState('');

  const load = useCallback(async () => {
    const url = tableFilter ? `/api/admin/history?table=${tableFilter}` : '/api/admin/history?limit=200';
    const r = await fetch(url);
    setItems(await r.json());
  }, [tableFilter]);
  useEffect(() => { load(); }, [load]);

  const ACTION_COLOR = { create:'#16a34a', update:'#d97706', delete:'#dc2626' };
  const TABLE_LABEL  = { std_term:'공통표준용어', std_word:'공통표준단어', std_domain:'공통표준도메인' };

  return (
    <div>
      <div style={{display:'flex',gap:8,marginBottom:14,alignItems:'center'}}>
        <SectionTitle>용어 변경 이력</SectionTitle>
        <div style={{flex:1}}/>
        {['','std_term','std_word','std_domain'].map(v=>(
          <button key={v} onClick={()=>setTableFilter(v)} style={S.btn(tableFilter===v?'hsl(var(--primary))':'hsl(var(--muted))',tableFilter===v?'hsl(var(--primary-foreground))':'hsl(var(--foreground))')}>
            {v===''?'전체':TABLE_LABEL[v]}
          </button>
        ))}
        <button onClick={load} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}><RefreshCwIcon size={13}/></button>
      </div>
      {items.length === 0 ? (
        <p style={{textAlign:'center',padding:32,color:'hsl(var(--muted-foreground))',fontSize:13}}>변경 이력 없음</p>
      ) : (
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5}}>
            <thead><tr style={{background:'hsl(var(--muted))'}}>
              {['작업','테이블','항목ID','변경일시','복원'].map(h=><th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>{items.map((item,i)=>(
              <tr key={item.id} style={{...S.row}}
                onClick={()=>onDetail({title:'변경 상세',fields:[
                  ['작업',item.action],
                  ['테이블',TABLE_LABEL[item.table_name]||item.table_name],
                  ['항목ID',item.record_id],
                  ['변경일시',new Date(item.changed_at).toLocaleString('ko-KR')],
                  ['변경 전',item.old_data?JSON.stringify(JSON.parse(item.old_data),null,2):'-'],
                  ['변경 후',item.new_data?JSON.stringify(JSON.parse(item.new_data),null,2):'-'],
                ]})}
                onMouseEnter={e=>e.currentTarget.style.background='hsl(var(--muted))'}
                onMouseLeave={e=>e.currentTarget.style.background='transparent'}>
                <td style={S.td}><span style={S.badge(ACTION_COLOR[item.action]||'#6b7280')}>{item.action}</span></td>
                <td style={S.td}>{TABLE_LABEL[item.table_name]||item.table_name}</td>
                <td style={S.td}>{item.record_id}</td>
                <td style={{...S.td,color:'hsl(var(--muted-foreground))',fontSize:11}}>{new Date(item.changed_at).toLocaleString('ko-KR')}</td>
                <td style={S.td}>
                  {item.action !== 'create' && item.old_data && (
                    <button onClick={async e=>{e.stopPropagation();if(!confirm('이 시점으로 복원할까요?'))return;await fetch(`/api/admin/rollback/${item.id}`,{method:'POST'});alert('복원 완료');}}
                      style={{...S.btn('#d97706'),padding:'3px 8px',fontSize:11}}>복원</button>
                  )}
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── DB 공백 리포트 ────────────────────────────────────────────────────────────
function DBReport() {
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    const r = await fetch('/api/db-report');
    setReport(await r.json());
    setLoading(false);
  };

  useEffect(() => { run(); }, []);

  const ISSUE_COLOR = (v) => v === 0 ? '#16a34a' : v < 10 ? '#d97706' : '#dc2626';

  return (
    <div>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:16}}>
        <SectionTitle>DB 공백 리포트</SectionTitle>
        <button onClick={run} style={S.btn('hsl(var(--muted))','hsl(var(--foreground))')}><RefreshCwIcon size={13}/>새로고침</button>
      </div>
      {loading ? <Loading/> : report && (
        <>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:10,marginBottom:20}}>
            {Object.entries(report.summary).map(([k,v])=>(
              <div key={k} style={{...S.card,marginBottom:0,textAlign:'center',cursor:'pointer'}}
                onClick={()=>{}}>
                <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginBottom:6}}>{k.replace(/_/g,' ')}</p>
                <p style={{fontSize:24,fontWeight:700,color:ISSUE_COLOR(v)}}>{v}</p>
                <p style={{fontSize:10,color:ISSUE_COLOR(v),marginTop:2}}>{v===0?'문제없음':'개선 필요'}</p>
              </div>
            ))}
          </div>

          <div style={{display:'flex',alignItems:'center',gap:10,padding:'14px 18px',borderRadius:10,background:report.total_issues===0?'#f0fdf4':'#fef9c3',border:`1px solid ${report.total_issues===0?'#bbf7d0':'#fde68a'}`,marginBottom:20}}>
            <span style={{fontSize:20}}>{report.total_issues===0?'✓':'!'}</span>
            <div>
              <p style={{fontSize:13,fontWeight:700,color:report.total_issues===0?'#15803d':'#92400e'}}>
                {report.total_issues===0 ? '모든 항목 정상' : `총 ${report.total_issues}건 개선 필요`}
              </p>
              <p style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>
                {report.total_issues===0 ? 'DB 데이터 품질이 완전합니다.' : '공통표준 편집 탭에서 항목을 수정하거나 임베딩을 재생성하세요.'}
              </p>
            </div>
          </div>

          {report.samples?.영문약어_없는_용어_샘플?.length > 0 && (
            <div>
              <SectionTitle>영문약어 없는 용어 샘플</SectionTitle>
              <div style={{display:'flex',flexWrap:'wrap',gap:6}}>
                {report.samples.영문약어_없는_용어_샘플.map((t,i)=>(
                  <span key={i} style={{padding:'3px 10px',borderRadius:99,background:'#fef3c7',color:'#92400e',fontSize:12,fontWeight:500}}>{t}</span>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── 사용자 관리 ───────────────────────────────────────────────────────────────
function UserManage() {
  const [users, setUsers]   = useState([]);
  const [newPw, setNewPw]   = useState({});

  const load = async () => { const r = await fetch('/api/auth/users'); setUsers(await r.json()); };
  useEffect(() => { load(); }, []);

  const del = async (id) => {
    if (!confirm('이 사용자를 삭제할까요?')) return;
    await fetch('/api/auth/users/' + id, { method:'DELETE' });
    load();
  };

  const changePw = async (id) => {
    const pw = newPw[id] || '';
    if (pw.length < 4) { alert('비밀번호는 4자 이상이어야 합니다.'); return; }
    await fetch('/api/auth/users/' + id + '/password', {
      method:'PATCH', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ password: pw }),
    });
    setNewPw(p => ({ ...p, [id]: '' }));
    alert('비밀번호가 변경됐습니다.');
  };

  return (
    <div>
      <SectionTitle>사용자 관리</SectionTitle>
      {users.length === 0 ? (
        <p style={{textAlign:'center',padding:32,color:'hsl(var(--muted-foreground))',fontSize:13}}>등록된 사용자 없음</p>
      ) : (
        <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead><tr style={{background:'hsl(var(--muted))'}}>
              {['아이디','이름','가입일','마지막 로그인','비밀번호 변경',''].map(h=><th key={h} style={S.th}>{h}</th>)}
            </tr></thead>
            <tbody>{users.map(u=>(
              <tr key={u.id}>
                <td style={S.td}>{u.username}</td>
                <td style={S.td}>{u.display_name}</td>
                <td style={{...S.td,fontSize:11,color:'hsl(var(--muted-foreground))'}}>{new Date(u.created_at).toLocaleDateString('ko-KR')}</td>
                <td style={{...S.td,fontSize:11,color:'hsl(var(--muted-foreground))'}}>{u.last_login ? new Date(u.last_login).toLocaleString('ko-KR') : '-'}</td>
                <td style={S.td}>
                  <div style={{display:'flex',gap:4}}>
                    <input type="password" placeholder="새 비밀번호"
                      value={newPw[u.id]||''} onChange={e=>setNewPw(p=>({...p,[u.id]:e.target.value}))}
                      style={{...S.input,width:120,padding:'4px 8px',fontSize:12}}/>
                    <button onClick={()=>changePw(u.id)} style={{...S.btn('hsl(var(--muted))','hsl(var(--foreground))'),padding:'4px 10px',fontSize:11}}>변경</button>
                  </div>
                </td>
                <td style={S.td}>
                  <button onClick={()=>del(u.id)} style={{...S.btn('hsl(var(--muted))','#dc2626'),padding:'4px 10px',fontSize:11}}>삭제</button>
                </td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SystemInfo() {
  const [info, setInfo] = useState(null);
  useEffect(()=>{ fetch('/api/admin/system').then(r=>r.json()).then(setInfo); },[]);
  if (!info) return <Loading/>;
  const rows=[['Python',info.python],['DB',`${info.db_host}:${info.db_port}`],['35B 모델',info.vllm_model],['35B 엔드포인트',info.vllm_url],['27B 모델',info.vllm_model_dense],['27B 엔드포인트',info.vllm_url_dense],['임베딩 모델',info.embed_model],['Temperature (현재)',info.temperature],['Max Tokens (현재)',info.max_tokens],['Top-K (현재)',info.top_k],['유사도 임계값 (현재)',info.similarity_threshold]];
  return (
    <div>
      <SectionTitle>시스템 정보</SectionTitle>
      <div style={{border:'1px solid hsl(var(--border))',borderRadius:10,overflow:'hidden'}}>
        {rows.map(([l,v],i)=>(
          <div key={l} style={{display:'flex',padding:'11px 18px',borderBottom:i<rows.length-1?'1px solid hsl(var(--border))':'none',fontSize:13}}>
            <span style={{width:200,fontWeight:600,color:'hsl(var(--muted-foreground))',flexShrink:0}}>{l}</span>
            <span style={{fontFamily:'monospace',fontSize:12}}>{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
