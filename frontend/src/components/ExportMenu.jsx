import { useState, useRef, useEffect } from 'react';
import { DownloadIcon, FileSpreadsheetIcon, FileTextIcon, FileIcon } from 'lucide-react';

export default function ExportMenu({ content, title = '챗봇 답변' }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, []);

  async function doExport(format) {
    setLoading(format); setOpen(false);
    try {
      const res = await fetch('/api/export', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content, title, format }),
      });
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const ext  = { excel: 'xlsx', word: 'docx', pdf: 'pdf' }[format];
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `${title}.${ext}`;
      document.body.appendChild(a); a.click();
      document.body.removeChild(a); URL.revokeObjectURL(url);
    } catch(e) { alert('내보내기 실패: ' + e.message); }
    finally { setLoading(null); }
  }

  const items = [
    { fmt: 'excel', icon: <FileSpreadsheetIcon size={13}/>, label: 'Excel (.xlsx)', color: '#16a34a' },
    { fmt: 'word',  icon: <FileTextIcon size={13}/>,        label: 'Word (.docx)',  color: '#2563eb' },
    { fmt: 'pdf',   icon: <FileIcon size={13}/>,            label: 'PDF (.pdf)',    color: '#dc2626' },
  ];

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={() => setOpen(o => !o)}
        title="내보내기"
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 4,
          padding: '3px 8px', borderRadius: 6,
          border: '1px solid hsl(var(--border))',
          background: 'hsl(var(--background))',
          color: 'hsl(var(--muted-foreground))',
          cursor: 'pointer', fontSize: 11, fontFamily: 'inherit',
          transition: 'all .12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = 'hsl(var(--muted))'; e.currentTarget.style.color = 'hsl(var(--foreground))'; }}
        onMouseLeave={e => { e.currentTarget.style.background = 'hsl(var(--background))'; e.currentTarget.style.color = 'hsl(var(--muted-foreground))'; }}
      >
        {loading ? '...' : <><DownloadIcon size={12}/> 내보내기</>}
      </button>

      {open && (
        <div style={{
          position: 'absolute', bottom: '100%', left: 0, marginBottom: 4,
          background: 'hsl(var(--background))',
          border: '1px solid hsl(var(--border))',
          borderRadius: 8, boxShadow: '0 4px 16px rgba(0,0,0,.12)',
          minWidth: 150, zIndex: 100, overflow: 'hidden',
        }}>
          {items.map(item => (
            <button
              key={item.fmt}
              onClick={() => doExport(item.fmt)}
              disabled={loading === item.fmt}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '9px 14px', width: '100%', border: 'none',
                background: 'none', cursor: 'pointer', fontSize: 12.5,
                color: 'hsl(var(--foreground))', fontFamily: 'inherit',
                transition: 'background .1s', textAlign: 'left',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'hsl(var(--muted))'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <span style={{ color: item.color }}>{item.icon}</span>
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
