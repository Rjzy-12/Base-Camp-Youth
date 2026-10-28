# Base Camp Youth Platform
Official Youth Information E-Governance Platform for Barangay Base Camp, Maramag, Bukidnon.

Plain HTML, CSS, and JavaScript (no build step) + Supabase (free database and login).

## What it does
Residents (no account needed):
- Join the youth registry (profile is reviewed by staff before it becomes official)
- Browse events in a monthly calendar or a list; announcements and events update live without refreshing
- Read announcements, filter by category, search
- See upcoming events and register (slots are enforced by the database)
- Request a document and get a tracking code, then check the status with that code
- Send feedback, inquiries, or suggestions
- Vote in event polls (one vote per device). Percentages appear when the poll ends, with a winner badge
- Post ideas for events or projects, like them, and discuss in a comment thread (Events page > Ideas)

Staff (login at admin.html):
- Process document requests (status + note the resident can see), download CSV, print
- Post, edit, pin, hide, delete announcements
- Create and manage events, view registrations, download CSV
- Youth registry: approve or reject self-registered profiles, add or edit profiles, search and filter by purok, age bracket and approval, download CSV, print
- Read and mark feedback
- Polls: create a poll with 2 to 6 choices and an end time, watch live results, end early, and the result announcement posts automatically
- Ideas: set status (Open, Under review, Planned, Declined), reply as staff, hide or delete ideas and comments

## Setup (all free)

### 1. Create the database (Supabase)
1. Go to supabase.com, sign up, click New project. Pick the closest region (Singapore). Save the database password.
2. Wait for the project to finish setting up.
3. Open SQL Editor > New query. Paste the whole contents of `database/schema.sql`. Click Run.
4. Open Project Settings > API. Copy the Project URL and the anon public key.
5. Open `js/config.js` in VS Code and paste both values.

### 1b. Run the update (registry + live updates)
In SQL Editor, run `database/update-1.sql` the same way. Optional: run `database/demo-data.sql` for fake sample youth so the registry is not empty during a demo.

### 1c. Run update 2 (polls + ideas)
In SQL Editor, run `database/update-2.sql`. This adds event polls (voting), idea threads with comments and likes, and the automatic result announcement.

Optional but recommended: so a poll closes exactly on time even if nobody has the site open, go to Database > Extensions, enable `pg_cron`, then run the one-line `cron.schedule` command at the bottom of `update-2.sql`. Without it, the poll closes and the result is announced the first time anyone opens the site after the deadline.

### 2. Create the first staff account
1. Supabase > Authentication > Users > Add user > Create new user.
   Enter an email and password and keep "Auto Confirm User" checked.
2. Go back to SQL Editor and run (use the same email):
   ```sql
   insert into admins (user_id, full_name)
   select id, 'Your Name' from auth.users where email = 'your-email@example.com';
   ```
3. Repeat for each SK or Barangay official who needs access.
4. Recommended: Authentication > Sign In / Providers > Email, turn OFF "Allow new users to sign up".

### 3. Run it on your computer
1. In VS Code install the extension Live Server.
2. Right click `index.html` > Open with Live Server.
3. Open `admin.html` and log in with the staff account.

### 4. Put it online for free
Easiest: Netlify Drop.
1. Go to app.netlify.com/drop and drag the whole `basecamp-youth` folder in.
2. You get a free link like `something.netlify.app`. You can rename it in Site settings.

Other free choices: Cloudflare Pages, GitHub Pages, Vercel (all work, because this is a static site).

## Good to know
- Supabase free projects pause after about 1 week with no activity. Visit the site or the Supabase dashboard before your defense or demo. If it paused, click Restore.
- Forms include a Data Privacy Act consent checkbox because you are collecting data from minors (ages 15 to 17).
- The youth registry is never readable by the public. The public can only submit a profile, which starts as Pending until staff approve it.
- Personal data (requests, registrations, registry) is not readable by the public. Only logged-in staff can read it.
- Delete the sample announcements and events from the admin page before the real launch.

## Files
- `index.html`, `announcements.html`, `events.html`, `request.html`, `feedback.html`: public pages
- `admin.html` + `js/admin.js`: staff dashboard
- `js/config.js`: your Supabase keys
- `js/common.js`: shared helpers
- `css/style.css`: design
- `register.html`: public youth registry form
- `database/schema.sql`: tables, security rules, sample data
- `database/update-1.sql`: youth registry table + live updates
- `database/update-2.sql`: polls, votes, ideas, comments, likes, auto-announcement
- `database/demo-data.sql`: optional fake youth for demos

## How polls work
- Staff create a poll in Staff dashboard > Polls (optionally posting an "open for voting" announcement).
- Youth vote on Events > Polls. Votes are stored through a secured database function, so the public can never read or edit raw votes.
- One vote per device is enforced using an anonymous id saved in the browser. This is a convenience limit, not identity verification: someone could vote again from another browser. For a stricter rule, tie voting to the approved youth registry later.
- Results stay hidden while voting is open. When the deadline passes, the poll closes, the winner and percentages are calculated, and a pinned "Poll results" announcement is posted automatically.
