import { pushTarget } from './push-target';

describe('pushTarget', () => {
  it('maps the server push paths to screens', () => {
    const id = '01a105e0-70a6-70bc-a7a1-bb92d7dd7186';
    expect(pushTarget({ url: `/shares/${id}` })).toEqual({ kind: 'share', id });
    expect(pushTarget({ url: '/friends' })).toEqual({ kind: 'friends' });
    expect(pushTarget({ url: '/inbox' })).toEqual({ kind: 'inbox' });
    expect(pushTarget({ url: '/shares/not-an-id' })).toEqual({ kind: 'notifications' });
    expect(pushTarget(undefined)).toEqual({ kind: 'notifications' });
  });
});
