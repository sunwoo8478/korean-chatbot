import { useState } from 'react';

export default function LoginModal({ onLogin }) {
  const [mode, setMode]     = useState('login');
  const [name, setName]     = useState('');
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [error, setError]   = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    setError('');
    if (!name.trim() || !password.trim()) { setError('이름과 비밀번호를 입력하세요.'); return; }
    if (mode === 'register') {
      if (password.length < 4) { setError('비밀번호는 4자 이상이어야 합니다.'); return; }
      if (password !== password2) { setError('비밀번호가 일치하지 않습니다.'); return; }
    }

    setLoading(true);
    try {
      const endpoint = mode === 'login' ? '/api/auth/login' : '/api/auth/register';
      const body = mode === 'login'
        ? { username: name.trim(), password }
        : { username: name.trim(), display_name: name.trim(), password };

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.detail || '오류가 발생했습니다.');
        setLoading(false);
        return;
      }

      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('username', data.username);
      localStorage.setItem('display_name', data.display_name);
      onLogin({ token: data.token, username: data.username, displayName: data.display_name });
    } catch {
      setError('서버 연결에 실패했습니다.');
    }
    setLoading(false);
  };

  const inp = (extra = {}) => ({
    width: '100%', padding: '11px 14px',
    border: '1px solid hsl(var(--border))', borderRadius: 9,
    fontSize: 14, outline: 'none', fontFamily: 'inherit',
    background: 'hsl(var(--background))', color: 'hsl(var(--foreground))',
    boxSizing: 'border-box', ...extra,
  });

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.6)', backdropFilter:'blur(6px)', zIndex:900, display:'flex', alignItems:'center', justifyContent:'center' }}>
      <div style={{ background:'hsl(var(--background))', borderRadius:16, width:360, padding:'36px 28px', boxShadow:'0 20px 60px rgba(0,0,0,.25)' }}>
        {/* 로고 */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:52, height:52, borderRadius:14, background:'linear-gradient(135deg,hsl(221 83% 53%),hsl(199 89% 60%))', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:800, color:'#fff', margin:'0 auto 14px' }}>NT</div>
          <h2 style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>NT Sys 챗봇</h2>
          <p style={{ fontSize:12, color:'hsl(var(--muted-foreground))' }}>공공데이터 공통표준 AI 어시스턴트</p>
        </div>

        {/* 탭 */}
        <div style={{ display:'flex', marginBottom:22, background:'hsl(var(--muted))', borderRadius:10, padding:3, gap:3 }}>
          {[['login','로그인'], ['register','회원가입']].map(([v, l]) => (
            <button key={v} onClick={() => { setMode(v); setError(''); }}
              style={{ flex:1, padding:'8px', border:'none', borderRadius:8, background: mode === v ? 'hsl(var(--background))' : 'transparent', color: mode === v ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))', fontSize:13, fontWeight:600, cursor:'pointer', fontFamily:'inherit', boxShadow: mode === v ? '0 1px 4px rgba(0,0,0,.1)' : 'none', transition:'all .15s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* 입력 */}
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          <input
            style={inp()}
            placeholder="이름"
            value={name}
            onChange={e => setName(e.target.value)}
            autoFocus
          />
          <input
            style={inp()}
            type="password"
            placeholder="비밀번호"
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && mode === 'login' && submit()}
          />
          {mode === 'register' && (
            <input
              style={inp()}
              type="password"
              placeholder="비밀번호 확인"
              value={password2}
              onChange={e => setPassword2(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && submit()}
            />
          )}
        </div>

        {error && (
          <p style={{ fontSize:12, color:'#dc2626', marginTop:10, textAlign:'center' }}>{error}</p>
        )}

        <button
          onClick={submit}
          disabled={loading}
          style={{ width:'100%', padding:12, border:'none', borderRadius:10, background:'hsl(var(--primary))', color:'hsl(var(--primary-foreground))', fontSize:14, fontWeight:700, cursor: loading ? 'not-allowed' : 'pointer', fontFamily:'inherit', marginTop:16, opacity: loading ? 0.7 : 1, transition:'opacity .15s' }}
        >
          {loading ? '처리 중...' : mode === 'login' ? '로그인' : '가입하기'}
        </button>

        {mode === 'register' && (
          <p style={{ fontSize:11, color:'hsl(var(--muted-foreground))', textAlign:'center', marginTop:10 }}>
            입력한 이름으로 대화 기록이 저장됩니다
          </p>
        )}
      </div>
    </div>
  );
}
