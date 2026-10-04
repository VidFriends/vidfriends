// Maestro (GraalJS): TOKEN's member replies BODY on the share they sent most recently, as if from
// another device (M7-T9 realtime check, FR-NOTIF-06).
var auth = { Authorization: 'Bearer ' + TOKEN };
var sent = http.get(SERVER_URL + '/api/v1/sent?limit=1', { headers: auth });
if (!sent.ok) throw new Error('sent: ' + sent.status + ' ' + sent.body);
var shareId = json(sent.body).items[0].id;
var res = http.post(SERVER_URL + '/api/v1/shares/' + shareId + '/replies', {
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN },
  body: JSON.stringify({ body: BODY }),
});
if (!res.ok) throw new Error('reply: ' + res.status + ' ' + res.body);
