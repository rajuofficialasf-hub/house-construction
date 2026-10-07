# As-Sunnah Foundation — Project Platform

A public site that lists each project's beneficiaries (housing, self-reliance, skill-based entrepreneurs and more), with an admin panel for records, photos and projects. New projects are created from the admin panel, with no code.

Technical details are in [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md).

## What you need

- [Docker Desktop](https://www.docker.com/products/docker-desktop/), installed and running. This is all you need to run the app.
- [git](https://git-scm.com/downloads), to get the code.
- [Claude Code](https://claude.com/claude-code), to add features.

## 1. Run the app

In a terminal:

```bash
git clone https://github.com/rajuofficialasf-hub/house-construction.git
cd house-construction
docker compose up
```

The first start takes a few minutes. When the log shows `housing API listening`, open http://localhost:5173. You'll see sample projects and records.

To stop, press `Ctrl+C` in that terminal. Next time, just run `docker compose up`.

## 2. Create your login

There is no sign-up page; logins are created with a command. While the app is running, open a second terminal in the same folder and run this, with your own email and name:

```bash
docker compose exec api npm run admin -- create --email you@example.org --name "Your Name" --role main_admin
```

It asks for a password twice. Nothing shows while you type; that's normal. Don't use a real password; pick one just for this.

Then log in at http://localhost:5173/admin/login.

## 3. Add features with Claude Code

1. The first time, install the As-Sunnah plugin in Claude Code. Its repo is private, so you need read access to `forhad-h/assunnah-engineering` on GitHub first. Claude Code works without the plugin, but the `/ae-…` commands below won't be there.

   ```
   /plugin marketplace add forhad-h/assunnah-engineering
   /plugin install assunnah-engineering@assunnah
   ```

2. Run `claude` in the project folder. Claude reads the project's rules by itself ([CLAUDE.md](CLAUDE.md)).

3. Say what you want in plain words, in English or Bangla. For example: "I want to search the records list by mobile number."

4. For bigger work, go in this order:
   - `/ae-brainstorm`: decide what to build
   - `/ae-plan`: plan how to build it
   - `/ae-work`: build it, with tests and review

   For small changes, just ask. Claude runs the tests itself.

5. When it's done, check it yourself in the browser. Then ask Claude to commit. Work on your own branch, and never push straight to `main`.

## If something goes wrong

- **"Cannot connect to the Docker daemon"**: start Docker Desktop.
- **"port is already allocated"**: something else is using port 5173, 3001 or 5432. Stop it and try again.
- **Start over from scratch**: `docker compose down -v`. This deletes the database and uploaded photos. The next `docker compose up` loads the sample data again, and you create your login again.
- If you're stuck, show the error message to Claude and ask.

## More to read

- [docs/DEVELOPER_GUIDE.md](docs/DEVELOPER_GUIDE.md): the technical guide (structure, pages, adding a feature step by step, tests, CI)
- [docs/ADMIN_GUIDE.md](docs/ADMIN_GUIDE.md): how to use the admin panel (in Bangla)
- [docs/README.md](docs/README.md): index of all docs
