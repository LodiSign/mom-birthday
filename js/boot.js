/* ============================================================
   boot.js — 반드시 마지막 스크립트.
   loadConfig()는 async라 await 지점에서 양보한다. 실패 경로의 renderLobby()가
   뒤쪽 <script>가 로드되기 전에 실행되지 않도록 별도 파일로 분리해 둔다.
   ============================================================ */

try {
  if (localStorage.getItem('mom-birthday-motion') === 'calm') document.body.dataset.motion = 'calm';
} catch {
  /* 저장소 접근 실패는 무시 */
}

loadConfig();
