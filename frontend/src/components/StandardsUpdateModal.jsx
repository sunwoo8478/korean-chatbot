import { useState, useRef } from 'react';
import { UploadIcon, XIcon, CheckCircleIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react';

export default function StandardsUpdateModal({ onClose }) {
  const [step, setStep]       = useState('upload');   // upload | preview | applying | done
  const [preview, setPreview] = useState(null);
  const [result, setResult]   = useState(null);
  const [error, setError]     = useState(null);
  const [file, setFile]       = useState(null);
  const [polling, setPolling] = useState(null);
  const inputRef = useRef(null);

  async function handleFile(f) {
    if (!f) return;
    if (!f.name.endsWith('.xlsx')) { setError('xlsx 파일만 지원합니다.'); return; }
    setFile(f); setError(null); setStep('loading');

    const fd = new FormData(); fd.append('file', f);
    try {
      const res = await fetch('/api/standards/preview', { method: 'POST', body: fd });
      if (!res.ok) { const e = await res.json(); throw new Error(e.detail || '미리보기 실패'); }
      setPreview(await res.json());
      setStep('preview');
    } catch(e) { setError(e.message); setStep('upload'); }
  }

  async function applyUpdate() {
    setStep('applying');
    const fd = new FormData(); fd.append('file', file);
    try {
      const res = await fetch('/api/standards/apply', { method: 'POST', body: fd });
      if (!res.ok) throw new Error('업데이트 요청 실패');
      const data = await res.json();
      // 폴링으로 완료 확인
      const id = data.id;
      const timer = setInterval(async () => {
        const r = await fetch(`/api/standards/updates/${id}`);
        const d = await r.json();
        if (d.status === 'done') {
          clearInterval(timer);
          setResult(d.result);
          setStep('done');
        } else if (d.status === 'error') {
          clearInterval(timer);
          setError(d.result?.error || '업데이트 중 오류');
          setStep('preview');
        }
      }, 3000);
      setPolling(timer);
    } catch(e) { setError(e.message); setStep('preview'); }
  }

  const totalChanges = preview ? (
    Object.values(preview.summary).reduce((s, v) => s + v.신규 + v.수정 + v.삭제, 0)
  ) : 0;

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(3px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' },
    modal: { background:'hsl(var(--background))',borderRadius:16,width:600,maxWidth:'95vw',maxHeight:'88vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.2)' },
    head: { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0 },
    body: { flex:1,overflowY:'auto',padding:20 },
    foot: { padding:'12px 20px',borderTop:'1px solid hsl(var(--border))',display:'flex',gap:8,justifyContent:'flex-end',flexShrink:0 },
    btn: (bg, col='#fff') => ({ padding:'8px 18px',borderRadius:8,border:'none',background:bg,color:col,fontSize:13,fontWeight:600,cursor:'pointer',fontFamily:'inherit',display:'flex',alignItems:'center',gap:6 }),
    statCard: (color) => ({ background:color+'12',border:`1px solid ${color}30`,borderRadius:10,padding:'14px 16px',flex:1 }),
  };

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.modal}>
        <div style={s.head}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700}}>공통표준 데이터 업데이트</h2>
            <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:2}}>
              새 공통표준 Excel 파일을 업로드해 변경분만 반영합니다
            </p>
          </div>
          <button onClick={onClose} style={s.btn('hsl(var(--muted))','hsl(var(--foreground))')}>
            <XIcon size={16}/>
          </button>
        </div>

        <div style={s.body}>
          {/* 에러 */}
          {error && (
            <div style={{background:'#fef2f2',border:'1px solid #fecaca',borderRadius:10,padding:'10px 14px',marginBottom:16,fontSize:13,color:'#dc2626',display:'flex',alignItems:'center',gap:8}}>
              <AlertCircleIcon size={16}/> {error}
            </div>
          )}

          {/* 업로드 */}
          {(step === 'upload' || step === 'loading') && (
            <div
              onClick={() => step==='upload' && inputRef.current?.click()}
              style={{border:'2px dashed hsl(var(--border))',borderRadius:12,padding:'40px 20px',textAlign:'center',cursor:step==='upload'?'pointer':'default',transition:'all .15s'}}
            >
              <input ref={inputRef} type="file" accept=".xlsx" style={{display:'none'}} onChange={e=>handleFile(e.target.files[0])}/>
              {step==='loading' ? (
                <>
                  <RefreshCwIcon size={28} style={{margin:'0 auto 10px',display:'block',color:'hsl(var(--muted-foreground))',animation:'spin 1s linear infinite'}}/>
                  <p style={{fontSize:14,fontWeight:500}}>분석 중...</p>
                </>
              ) : (
                <>
                  <UploadIcon size={28} style={{margin:'0 auto 10px',display:'block',color:'hsl(var(--muted-foreground))'}}/>
                  <p style={{fontSize:14,fontWeight:500}}>공통표준 Excel 파일 선택</p>
                  <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:5}}>
                    파일명 예시: 공공데이터 공통표준(2026.01월).xlsx
                  </p>
                </>
              )}
            </div>
          )}

          {/* 미리보기 */}
          {step === 'preview' && preview && (
            <>
              <div style={{background:'hsl(var(--muted))',borderRadius:10,padding:'12px 16px',marginBottom:16,fontSize:13}}>
                <p style={{fontWeight:600,marginBottom:4}}>{preview.file}</p>
                {totalChanges === 0
                  ? <p style={{color:'hsl(142 71% 45%)'}}>변경 사항 없음 — 이미 최신 데이터입니다.</p>
                  : <p>총 <strong>{totalChanges}건</strong> 변경 예정</p>
                }
              </div>

              {/* 요약 테이블 */}
              {['용어', '단어', '도메인'].map(type => {
                const d = preview.summary[type];
                return (
                  <div key={type} style={{border:'1px solid hsl(var(--border))',borderRadius:10,marginBottom:12,overflow:'hidden'}}>
                    <div style={{padding:'10px 14px',background:'hsl(var(--muted))',fontWeight:600,fontSize:13}}>
                      공통표준{type} (전체 {d.전체}건)
                    </div>
                    <div style={{display:'flex',gap:0}}>
                      {[
                        {label:'신규', count:d.신규, color:'#16a34a'},
                        {label:'수정', count:d.수정, color:'#d97706'},
                        {label:'삭제', count:d.삭제, color:'#dc2626'},
                        {label:'유지', count:d.전체-d.신규-d.수정-d.삭제, color:'#6b7280'},
                      ].map(({label,count,color}) => (
                        <div key={label} style={{flex:1,padding:'12px',textAlign:'center',borderRight:'1px solid hsl(var(--border))'}}>
                          <p style={{fontSize:20,fontWeight:700,color}}>{count}</p>
                          <p style={{fontSize:11,color:'hsl(var(--muted-foreground))',marginTop:2}}>{label}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* 샘플 */}
              {preview.samples?.['신규 용어 샘플']?.length > 0 && (
                <div style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:8}}>
                  <p style={{fontWeight:600,marginBottom:4}}>신규 용어 샘플</p>
                  <div style={{display:'flex',flexWrap:'wrap',gap:4}}>
                    {preview.samples['신규 용어 샘플'].map((name,i) => (
                      <span key={i} style={{background:'hsl(142 71% 92%)',color:'hsl(142 71% 30%)',padding:'2px 8px',borderRadius:99,fontSize:11}}>{name}</span>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}

          {/* 적용 중 */}
          {step === 'applying' && (
            <div style={{textAlign:'center',padding:'32px 0'}}>
              <RefreshCwIcon size={36} style={{margin:'0 auto 16px',display:'block',color:'hsl(var(--muted-foreground))'}}/>
              <p style={{fontSize:15,fontWeight:600}}>업데이트 적용 중...</p>
              <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:8}}>
                변경된 항목의 임베딩을 재생성합니다. 잠시 기다려주세요.
              </p>
            </div>
          )}

          {/* 완료 */}
          {step === 'done' && result && (
            <>
              <div style={{textAlign:'center',padding:'16px 0 24px'}}>
                <CheckCircleIcon size={40} style={{color:'hsl(142 71% 45%)',margin:'0 auto 10px',display:'block'}}/>
                <p style={{fontSize:16,fontWeight:700}}>업데이트 완료</p>
              </div>
              {['용어','단어','도메인'].map(type => {
                const d = result[type];
                if (!d) return null;
                return (
                  <div key={type} style={{display:'flex',gap:8,marginBottom:8,fontSize:13}}>
                    <span style={{fontWeight:600,width:60}}>공통{type}</span>
                    <span style={{color:'#16a34a'}}>+{d.added}</span>
                    <span style={{color:'#d97706'}}>~{d.modified}</span>
                    <span style={{color:'#dc2626'}}>-{d.deleted}</span>
                    <span style={{color:'#6b7280'}}>={d.unchanged} 유지</span>
                  </div>
                );
              })}
            </>
          )}
        </div>

        <div style={s.foot}>
          <button onClick={() => { setStep('upload'); setPreview(null); setFile(null); setError(null); }} style={s.btn('hsl(var(--muted))','hsl(var(--foreground))')}>
            {step==='done' ? '닫기' : '취소'}
          </button>
          {step==='preview' && totalChanges > 0 && (
            <button onClick={applyUpdate} style={s.btn('hsl(var(--primary))','hsl(var(--primary-foreground))')}>
              {totalChanges}건 적용하기
            </button>
          )}
          {step==='done' && (
            <button onClick={onClose} style={s.btn('hsl(142 71% 45%)')}>
              <CheckCircleIcon size={14}/> 완료
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
