/* sw.js — 서비스워커.
   하는 일은 딱 하나: "앱으로 설치"가 되게 만드는 것.
   안드로이드 크롬은 fetch 를 듣는 서비스워커가 있어야만 진짜 앱(WebAPK)으로 깔아준다.
   없으면 그냥 바로가기라서 주소창이 그대로 보이고 세로 고정도 안 걸린다.

   일부러 아무것도 캐시하지 않는다. 이 게임은 집 안 서버(serve.cjs)에 붙어
   파티 설정과 진행 상황을 주고받으므로 오프라인으로 할 수 있는 게 없고,
   캐시를 두면 js/css 를 고쳐도 옛 파일이 계속 떠서 디버깅만 어려워진다.
   ponytail: 통과만 시킨다. 오프라인이 필요해지면 그때 캐시를 넣을 것 */

// 새로 고친 서비스워커가 곧바로 일하게 한다(탭을 다 닫을 때까지 기다리지 않게)
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

// respondWith 를 부르지 않으면 브라우저가 평소대로 받아온다. 설치 조건만 채우는 빈 핸들러.
self.addEventListener('fetch', () => {});
