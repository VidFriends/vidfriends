# vidshare
share short form videos with friends

1) Create a new repo, push files.
2) On Cloudflare dashboard → Pages → Create a project → connect repo.
3) Build command: `npm run build`; Publish directory: `dist`
4) Add environment variable VITE_API_BASE if you'll point to Workers on a custom route (optional).
5) Copy `public/service-worker.js` (or built service worker) to root so it's available at /service-worker.js
6) Deploy.




vidshare is a pwa that has logins for users, and builds users an fyp that only contains videos sent from friends, and can process videos from many short form video sites, such as tiktok, facebook reels, instagram reels, youtube shorts, etc. it is designed with minimal server load in mind, currently designed to handle embedding videos directly on the user side rather than processing raw video files. in the future will look into possibly some server side compute to extract videos rather than embedding them for a cleaner view.

users can react to videos and send replies, and get notified when new videos are sent to them.

this platform is privacy focused, storing little to no data on users, allowing flexible login types such as only passkeys, or only username/password, as well as social logins, to choose the level of privacy.

Development goal of this program is for the whole service to be run on cloudflare free tier services, and if the userbase grows too much then it can expand to paid cloudflare tiers. no ads, but may eventually charge a subscription if we exceed free tier. will probably move to native app before this happens.