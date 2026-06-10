import { useState, useEffect } from 'react';
import { XIcon, PlusIcon, TrashIcon, DownloadIcon } from 'lucide-react';

const EMPTY_COL = { column_name:'', korean_name:'', data_type:'', length:'', decimal:'', storage_format:'', display_format:'', description:'', nullable:'N', primary_key:false };

export default function ColumnExportModal({ onClose }) {
  const [tableName, setTableName] = useState('TB_');
  const [columns, setColumns]     = useState([{ ...EMPTY_COL }]);
  const [lookupInput, setLookupInput] = useState('');
  const [loading, setLoading]     = useState(false);

  const addCol   = () => setColumns(c => [...c, { ...EMPTY_COL }]);
  const removeCol = (i) => setColumns(c => c.filter((_,idx) => idx !== i));
  const updateCol = (i, key, val) => setColumns(c => c.map((col, idx) => idx === i ? {...col, [key]: val} : col));

  const lookup = async () => {
    const terms = lookupInput.split(/[,\n]/).map(t=>t.trim()).filter(Boolean);
    if (!terms.length) return;
    setLoading(true);
    const r = await fetch('/api/export/columns/lookup', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ terms }),
    });
    const data = await r.json();
    setColumns(data.length ? data : [{ ...EMPTY_COL }]);
    setLoading(false);
  };

  const exportFile = async (fmt) => {
    const r = await fetch('/api/export/columns', {
      method:'POST', headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ columns, table_name: tableName, format: fmt }),
    });
    const blob = await r.blob();
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `${tableName}_columns.${fmt}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(3px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' },
    modal:   { background:'hsl(var(--background))',borderRadius:16,width:1000,maxWidth:'97vw',height:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.2)',overflow:'hidden' },
    input:   { padding:'6px 10px',border:'1px solid hsl(var(--border))',borderRadius:7,fontSize:12.5,outline:'none',fontFamily:'inherit',background:'hsl(var(--background))',color:'hsl(var(--foreground))',width:'100%',boxSizing:'border-box' },
    btn:     (bg,col='#fff') => ({ padding:'6px 14px',borderRadius:8,border:'none',background:bg,color:col,fontSize:12.5,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:5 }),
    th:      { padding:'7px 8px',fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',background:'hsl(var(--muted))',whiteSpace:'nowrap',textAlign:'left' },
    td:      { padding:'4px 6px',borderTop:'1px solid hsl(var(--border))' },
  };

  const COLS = [
    {key:'korean_name',  label:'한글명',     w:120},
    {key:'column_name',  label:'컬럼명(영문)', w:130},
    {key:'data_type',    label:'타입',        w:90},
    {key:'length',       label:'길이',        w:60},
    {key:'decimal',      label:'소수점',      w:60},
    {key:'storage_format', label:'저장형식',  w:140},
    {key:'display_format', label:'표현형식',  w:140},
    {key:'description',  label:'설명',        w:160},
    {key:'nullable',     label:'NOT NULL',    w:70},
    {key:'primary_key',  label:'PK',          w:40},
  ];

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.modal}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 20px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0}}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700}}>컬럼 설계서 자동 생성</h2>
            <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:2}}>공통표준 기반 컬럼 정의서를 Excel/CSV로 내보냅니다</p>
          </div>
          <button onClick={onClose} style={s.btn('hsl(var(--muted))','hsl(var(--foreground))')}><XIcon size={15}/></button>
        </div>

        <div style={{padding:'14px 20px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0,display:'flex',gap:12,alignItems:'flex-end'}}>
          <div style={{flex:1}}>
            <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:4}}>용어명 일괄 조회 (쉼표 또는 줄바꿈으로 구분)</label>
            <textarea
              style={{...s.input,minHeight:48,resize:'vertical',fontFamily:'inherit'}}
              placeholder="납부금액, 주민등록번호, 사업자등록번호"
              value={lookupInput}
              onChange={e=>setLookupInput(e.target.value)}
            />
          </div>
          <button onClick={lookup} disabled={loading} style={{...s.btn('hsl(var(--primary))'),flexShrink:0,alignSelf:'flex-end'}}>
            {loading ? '조회 중...' : '공통표준 조회'}
          </button>
          <div style={{flexShrink:0}}>
            <label style={{fontSize:11,fontWeight:600,color:'hsl(var(--muted-foreground))',display:'block',marginBottom:4}}>테이블명</label>
            <input style={{...s.input,width:160}} value={tableName} onChange={e=>setTableName(e.target.value)} placeholder="TB_PAYMENT"/>
          </div>
        </div>

        <div style={{flex:1,overflowY:'auto',padding:'0 0 0 0'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:12}}>
            <thead>
              <tr>
                {COLS.map(c=><th key={c.key} style={{...s.th,minWidth:c.w,width:c.w}}>{c.label}</th>)}
                <th style={{...s.th,width:36}}></th>
              </tr>
            </thead>
            <tbody>
              {columns.map((col, i) => (
                <tr key={i} style={{background:i%2===0?'transparent':'hsl(var(--muted)/0.3)'}}>
                  {COLS.map(c=>(
                    <td key={c.key} style={s.td}>
                      {c.key === 'primary_key' ? (
                        <input type="checkbox" checked={col[c.key]||false}
                          onChange={e=>updateCol(i, c.key, e.target.checked)}
                          style={{margin:'0 auto',display:'block'}}/>
                      ) : c.key === 'nullable' ? (
                        <select value={col[c.key]||'N'} onChange={e=>updateCol(i,c.key,e.target.value)}
                          style={{...s.input,padding:'3px 6px'}}>
                          <option value="N">N</option>
                          <option value="Y">Y</option>
                        </select>
                      ) : (
                        <input style={{...s.input,padding:'4px 7px'}}
                          value={col[c.key]||''}
                          onChange={e=>updateCol(i, c.key, e.target.value)}/>
                      )}
                    </td>
                  ))}
                  <td style={s.td}>
                    <button onClick={()=>removeCol(i)} style={{...s.btn('hsl(var(--muted))','#dc2626'),padding:'3px 6px'}}>
                      <TrashIcon size={12}/>
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div style={{padding:'12px 20px',borderTop:'1px solid hsl(var(--border))',display:'flex',gap:8,justifyContent:'space-between',flexShrink:0}}>
          <button onClick={addCol} style={s.btn('hsl(var(--muted))','hsl(var(--foreground))')}><PlusIcon size={13}/>행 추가</button>
          <div style={{display:'flex',gap:8}}>
            <button onClick={()=>exportFile('csv')} style={s.btn('hsl(var(--muted))','hsl(var(--foreground))')}><DownloadIcon size={13}/>CSV</button>
            <button onClick={()=>exportFile('xlsx')} style={s.btn('hsl(var(--primary))')}><DownloadIcon size={13}/>Excel 다운로드</button>
          </div>
        </div>
      </div>
    </div>
  );
}
