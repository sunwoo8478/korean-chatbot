/**
 * /api/admin/*와 /api/auth/users* 요청에 세션 토큰을 자동으로 붙인다.
 * 백엔드가 이 두 그룹의 라우트에 관리자 인증을 새로 요구하게 됐는데, 기존
 * AdminPanel.jsx 등의 fetch 호출 수십 곳을 전부 고치는 대신 전역 fetch를
 * 한 곳에서 감싸서 투명하게 헤더를 주입한다.
 */
const ADMIN_PATH = /^\/api\/(admin\/|auth\/users)/;
const originalFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url && ADMIN_PATH.test(url)) {
    const token = localStorage.getItem('auth_token');
    if (token) {
      init = {
        ...init,
        headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` },
      };
    }
  }
  return originalFetch(input, init);
};
