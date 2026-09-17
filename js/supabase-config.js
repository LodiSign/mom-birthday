// Supabase 연결 값. 둘 다 브라우저에 들어가도 되는 공개 값이다.
// publishable(anon) 키로는 supabase/schema.sql 의 mbg_ 함수만 부를 수 있고, 표는 직접 못 건드린다.
// secret(service_role) 키는 절대 여기에 넣지 말 것 — 모든 잠금을 무시한다.
// persona-room 과 같은 프로젝트를 쓴다. 이 앱의 것은 전부 mbg_ 로 시작한다.
window.SUPABASE_CONFIG = {
  url: 'https://xeftdnorgidbwbgjizot.supabase.co',
  key: 'sb_publishable_iked_j44NOtF6Cpcd0anOw_kS7O8sa2',
};
