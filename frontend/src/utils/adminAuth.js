/**
 * 인증이 필요해진 라우트(/api/admin/*, /api/auth/users*, /api/conversations*,
 * /api/messages/*)에 세션 토큰을 자동으로 붙인다. 백엔드가 관리자 콘솔 인증과
 * 대화 소유권 검증을 새로 요구하게 됐는데, 이 요청들을 흩어져 있는 fetch 호출
 * 수십 곳에서 일일이 고치는 대신 전역 fetch를 한 곳에서 감싸서 투명하게
 * 헤더를 주입한다.
 */
const AUTH_REQUIRED_PATH = /^\/api\/(admin\/|auth\/users|conversations|messages\/)/;
const originalFetch = window.fetch.bind(window);

window.fetch = (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url;
  if (url && AUTH_REQUIRED_PATH.test(url)) {
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
