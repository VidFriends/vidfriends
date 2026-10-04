// Maestro (GraalJS): mints a 60 s hand-off code for TOKEN's account, bound to the E2E build's
// fixed verifier, as the server's /app-auth page would after a passkey sign-in (WF-AUTH-5).
var res = http.post(SERVER_URL + '/api/v1/auth/mobile/code', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ code_challenge: HANDOFF_CHALLENGE }),
});
if (!res.ok) throw new Error('mobile code: ' + res.status + ' ' + res.body);
output.code = json(res.body).code;
