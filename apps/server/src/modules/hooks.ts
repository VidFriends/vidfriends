// Cross-module event wiring, assigned once per process. Keeps dependencies one-way (SDD §1):
// friends and videos raise events; shares and notifications react.
import { friendEvents } from './friends/service.js';
import { notify } from './notifications/service.js';
import { deleteSharesBetween, deliverPendingShares } from './shares/service.js';
import { videoEvents } from './videos/events.js';

videoEvents.becamePlayable = deliverPendingShares;

friendEvents.requestReceived = (deps, tx, from, to) =>
  notify(deps, tx, { userId: to, type: 'friend_request_received', actorId: from }).then(
    () => undefined,
  );
friendEvents.requestAccepted = (deps, tx, accepter, requester) =>
  notify(deps, tx, { userId: requester, type: 'friend_request_accepted', actorId: accepter }).then(
    () => undefined,
  );
// BR-FRND-5: existing shares between the pair are deleted for both sides.
friendEvents.blocked = (_deps, tx, blocker, blocked) => deleteSharesBetween(tx, blocker, blocked);
