import {
  acceptFriendRequest,
  blockUser,
  cancelFriendRequest,
  declineFriendRequest,
  listBlocks,
  listFriendRequests,
  createFriendGroup,
  deleteFriendGroup,
  listFriendGroups,
  listFriends,
  updateFriendGroup,
  removeFriend,
  searchUsers,
  sendFriendRequest,
  unblockUser,
} from '@vidfriends/contracts';
import { handler } from '../../http/register.js';
import * as groups from './groups.js';
import * as friends from './service.js';

export const friendHandlers = [
  handler(listFriendGroups, async ({ deps, viewer }) => ({
    items: await groups.listGroups(deps, viewer),
  })),
  handler(createFriendGroup, async ({ deps, viewer, body }) => ({
    group: await groups.createGroup(deps, viewer, body),
  })),
  handler(updateFriendGroup, async ({ deps, viewer, params, body }) => ({
    group: await groups.updateGroup(deps, viewer, params.id, body),
  })),
  handler(deleteFriendGroup, async ({ deps, viewer, params }) => {
    await groups.deleteGroup(deps, viewer, params.id);
  }),
  handler(searchUsers, async ({ deps, viewer, query }) => ({
    items: await friends.search(deps, viewer, query.q),
  })),
  handler(listFriends, async ({ deps, viewer }) => ({
    items: await friends.listFriends(deps, viewer),
  })),
  handler(listFriendRequests, async ({ deps, viewer, query }) => ({
    items: await friends.listRequests(deps, viewer, query.direction),
  })),
  handler(listBlocks, async ({ deps, viewer }) => ({
    items: await friends.listBlocks(deps, viewer),
  })),
  handler(sendFriendRequest, async ({ deps, viewer, body, ip }) => ({
    relationship: await friends.sendRequest(deps, viewer, body.user_id, ip),
  })),
  handler(acceptFriendRequest, async ({ deps, viewer, params, ip }) => ({
    relationship: await friends.acceptRequest(deps, viewer, params.user_id, ip),
  })),
  handler(declineFriendRequest, async ({ deps, viewer, params }) => {
    await friends.declineRequest(deps, viewer, params.user_id);
  }),
  handler(cancelFriendRequest, async ({ deps, viewer, params }) => {
    await friends.cancelRequest(deps, viewer, params.user_id);
  }),
  handler(removeFriend, async ({ deps, viewer, params, ip }) => {
    await friends.removeFriend(deps, viewer, params.user_id, ip);
  }),
  handler(blockUser, async ({ deps, viewer, params, ip }) => {
    await friends.block(deps, viewer, params.user_id, ip);
  }),
  handler(unblockUser, async ({ deps, viewer, params, ip }) => {
    await friends.unblock(deps, viewer, params.user_id, ip);
  }),
];
