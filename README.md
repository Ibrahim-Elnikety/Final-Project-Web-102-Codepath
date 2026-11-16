# Web Development Final Project - *Wayfarer's Table*
Submitted by: **Ibrahim Elnikety**

This web app: **A community fantasy RPG where each post sets a scene, players comment with character actions and dice checks, and the scene's author chooses an action as canon for the next chapter.**

Time spent: **2 hrs**

## Required Features
The following **required** functionality is completed:
- [x] **Web app includes a create form that allows the user to create posts**
  - Form requires users to add a post title
  - Forms should have the *option* for users to add:
    - additional textual content
    - an image added as an external image URL
- [x] **Web app includes a home feed displaying previously created posts**
  - Web app must include home feed displaying previously created posts
  - By default, each post on the posts feed should show only the post's:
    - creation time
    - title
    - upvotes count
  - Clicking on a post should direct the user to a new page for the selected post
- [x] **Users can view posts in different ways**
  - Users can sort posts by either:
    - creation time
    - upvotes count
  - Users can search for posts by title
- [x] **Users can interact with each post in different ways**
  - The app includes a separate post page for each created post when clicked, where any additional information is shown, including:
    - content
    - image
    - comments (RPG actions)
  - Users can leave comments underneath a post on the post page
  - Each post includes an upvote button on the post page.
    - Each click increases the post's upvotes count by one
    - Users can upvote any post any number of times
- [x] **A post that a user previously created can be edited or deleted from its post pages**
  - After a user creates a new post, they can go back and edit the post
  - A previously created post can be deleted from its post page

The following **optional** features are implemented:
- [x] Web app implements pseudo-authentication
  - Supabase anonymous sign-in assigns a persistent player ID; posts, characters, and actions display the player's chosen name
  - Only the original scene author can edit or delete a scene; players can remove their own actions, and scene authors can moderate actions in their scene
- [x] Users can repost a previous post by referencing its post ID. On the post page of the new post
  - A new scene can continue a previous scene, which is linked in the thread
  - The previous scene's selected canon action is shown with the link
- [ ] Users can customize the interface
  - e.g., selecting the color scheme or showing the content and image of each post on the home feed
- [x] Users can add more characteristics to their posts
  - Scene flags include Adventure, Encounter, Mystery, Campfire, Question, and Opinion; the feed can filter by flag
  - Character scores use six 4d6-drop-lowest rolls, assigned by the player's ranked ability priorities and adjusted to a 72-point total; the lowest stat is capped at 17 when points are added
  - Characters and scenes can include optional external image URLs
  - Players roll a d20 plus the selected character's ability modifier for each action; an optional difficulty check displays success or failure
- [x] Web app displays a loading animation whenever data is being fetched

The following **additional** features are implemented:
* [x] A shared character ledger with six ability scores, character portraits, and player ownership
* [x] Scene authors can choose one action as canon for the next scene
* [x] Scene rosters, action rolls, linked story threads, responsive layout, and accessible loading/error states

## Video Walkthrough
Here's a walkthrough of implemented user stories:
<img src='Recording 2026-11-16 094415.gif' title='Video Walkthrough' width='800' alt='Video walkthrough of Wayfarer’s Table' />

## Notes
### Run the app locally
1. Install Node.js 20 or later.
2. In the project folder, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Fill in `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` from your Supabase project's **Settings → API** page. The publishable client key is intended for browser use; **never** put a service-role key or database password in a `VITE_` variable.
5. Run `npm run dev` and open the local URL printed by Vite. Run `npm run build` to create a production build.

### Supabase setup
This repository is connected to Supabase with its working directory set to the repository root (`.`). The database schema is in `supabase/migrations/20261116000000_create_wayfarers_table.sql`.

1. In Supabase **Authentication → Sign-in / Providers**, enable **Anonymous Sign-Ins**. The app uses anonymous Auth to give each browser a persistent player ID.
2. Apply the migration above to the connected project. With the GitHub integration, commit and push the `supabase/` folder to the configured production branch and confirm the migration is applied in Supabase. If the integration does not apply migrations automatically, paste the migration into the Supabase SQL Editor and run it once.
3. Copy the project URL and public anon/publishable key into `.env.local`, then restart Vite.

Row Level Security is enabled for all three tables. Reads are available to signed-in anonymous players; writes and deletes are limited to the owning player (with scene authors able to moderate actions in their own scenes). Upvotes use a database function so simultaneous clicks increment safely. Dice rolls are casual, client-generated rolls rather than a competitive or tamper-proof game mechanic.

### Notes on play
The author of a scene selects an action from its thread as canon. The next scene can reference that scene, showing its selected canon action as part of the story. Ability modifiers use `floor((score - 10) / 2)`. A check without a difficulty number is recorded without a pass/fail outcome.

Describe any challenges encountered while building the app. **Project setup and GIF walkthrough are still in progress.**

## License
    Copyright 2026 Ibrahim Elnikety
    Licensed under the Apache License, Version 2.0 (the "License");
    you may not use this file except in compliance with the License.
    You may obtain a copy of the License at
        http://www.apache.org/licenses/LICENSE-2.0
    Unless required by applicable law or agreed to in writing, software
    distributed under the License is distributed on an "AS IS" BASIS,
    WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
    See the License for the specific language governing permissions and
    limitations under the License.
