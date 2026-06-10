import { useState, useEffect, useRef } from 'react';
import { UploadIcon, TrashIcon, XIcon, FileIcon, CheckCircleIcon, LoaderIcon } from 'lucide-react';

const FILE_LABELS = { pdf: 'PDF', docx: 'DOCX', doc: 'DOC', xlsx: 'XLSX', xls: 'XLS', txt: 'TXT', md: 'MD', hwp: 'HWP' };
const STATUS_COLOR = { ready: '#16a34a', processing: '#d97706', error: '#dc2626' };
const STATUS_LABEL = { ready: '완료', processing: '처리 중', error: '오류' };

export default function DocumentsModal({ onClose }) {
  const [docs, setDocs] = useState([]);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => { loadDocs(); const t = setInterval(loadDocs, 3000); return () => clearInterval(t); }, []);

  async function loadDocs() {
    const res = await fetch('/api/documents');
    if (res.ok) setDocs(await res.json());
  }

  async function uploadFiles(files) {
    setUploading(true);
    for (const file of files) {
      const fd = new FormData();
      fd.append('file', file);
      await fetch('/api/documents/upload', { method: 'POST', body: fd });
    }
    setUploading(false);
    loadDocs();
  }

  async function deleteDoc(id) {
    if (!confirm('이 문서를 삭제할까요?')) return;
    await fetch(`/api/documents/${id}`, { method: 'DELETE' });
    loadDocs();
  }

  function onDrop(e) {
    e.preventDefault(); setDragging(false);
    uploadFiles([...e.dataTransfer.files]);
  }

  const s = {
    overlay: { position:'fixed',inset:0,background:'rgba(0,0,0,.45)',backdropFilter:'blur(3px)',zIndex:500,display:'flex',alignItems:'center',justifyContent:'center' },
    modal:   { background:'hsl(var(--background))',borderRadius:16,width:580,maxWidth:'95vw',maxHeight:'85vh',display:'flex',flexDirection:'column',boxShadow:'0 20px 60px rgba(0,0,0,.2)' },
    head:    { display:'flex',alignItems:'center',justifyContent:'space-between',padding:'16px 20px',borderBottom:'1px solid hsl(var(--border))',flexShrink:0 },
    body:    { flex:1,overflowY:'auto',padding:20 },
  };

  return (
    <div style={s.overlay} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={s.modal}>
        <div style={s.head}>
          <div>
            <h2 style={{fontSize:16,fontWeight:700}}>문서 업로드</h2>
            <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:2}}>PDF, Word, Excel, HWP 파일을 업로드해 RAG에 포함합니다</p>
          </div>
          <button onClick={onClose} style={{padding:'6px 10px',borderRadius:8,border:'1px solid hsl(var(--border))',background:'hsl(var(--muted))',cursor:'pointer',fontSize:14}}>
            <XIcon size={16}/>
          </button>
        </div>

        <div style={s.body}>
          {/* 드래그 업로드 영역 */}
          <div
            onDragOver={e=>{e.preventDefault();setDragging(true)}}
            onDragLeave={()=>setDragging(false)}
            onDrop={onDrop}
            onClick={()=>inputRef.current?.click()}
            style={{
              border: `2px dashed ${dragging ? 'hsl(var(--primary))' : 'hsl(var(--border))'}`,
              borderRadius: 12, padding: '32px 20px', textAlign: 'center',
              cursor: 'pointer', transition: 'all .15s', marginBottom: 20,
              background: dragging ? 'hsl(var(--muted))' : 'transparent',
            }}
          >
            <input ref={inputRef} type="file" multiple accept=".pdf,.docx,.doc,.xlsx,.xls,.txt,.md,.hwp"
              style={{display:'none'}} onChange={e=>uploadFiles([...e.target.files])}/>
            <UploadIcon size={28} style={{margin:'0 auto 10px',color:'hsl(var(--muted-foreground))',display:'block'}}/>
            <p style={{fontSize:14,fontWeight:500,color:'hsl(var(--foreground))'}}>
              {uploading ? '업로드 중...' : '파일을 드래그하거나 클릭해서 선택'}
            </p>
            <p style={{fontSize:12,color:'hsl(var(--muted-foreground))',marginTop:5}}>
              PDF, Word(.docx), Excel(.xlsx), HWP, TXT, Markdown — 최대 50MB
            </p>
          </div>

          {/* 문서 목록 */}
          {docs.length === 0 ? (
            <p style={{textAlign:'center',color:'hsl(var(--muted-foreground))',fontSize:13,padding:'16px 0'}}>업로드된 문서 없음</p>
          ) : docs.map(doc => {
            const ext = doc.file_type?.replace('.','') || 'file';
            const label = FILE_LABELS[ext] || ext.toUpperCase();
            return (
              <div key={doc.id} style={{display:'flex',alignItems:'center',gap:12,padding:'10px 14px',border:'1px solid hsl(var(--border))',borderRadius:10,marginBottom:8}}>
                <span style={{fontSize:10,fontWeight:700,padding:'3px 6px',borderRadius:5,background:'hsl(var(--muted))',color:'hsl(var(--muted-foreground))',flexShrink:0,minWidth:36,textAlign:'center'}}>{label}</span>
                <div style={{flex:1,minWidth:0}}>
                  <p style={{fontWeight:500,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{doc.filename}</p>
                  <div style={{display:'flex',alignItems:'center',gap:8,marginTop:3}}>
                    <span style={{fontSize:11,fontWeight:600,color:STATUS_COLOR[doc.status]||'#888'}}>
                      {doc.status === 'processing' && <LoaderIcon size={10} style={{display:'inline',marginRight:3}}/>}
                      {STATUS_LABEL[doc.status] || doc.status}
                    </span>
                    {doc.total_chunks > 0 && <span style={{fontSize:11,color:'hsl(var(--muted-foreground))'}}>청크 {doc.total_chunks}개</span>}
                  </div>
                </div>
                <button onClick={()=>deleteDoc(doc.id)} style={{padding:'5px',borderRadius:6,border:'1px solid hsl(var(--border))',background:'none',cursor:'pointer',color:'hsl(var(--muted-foreground))',transition:'color .12s'}}
                  onMouseEnter={e=>e.currentTarget.style.color='#dc2626'}
                  onMouseLeave={e=>e.currentTarget.style.color='hsl(var(--muted-foreground))'}>
                  <TrashIcon size={14}/>
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
