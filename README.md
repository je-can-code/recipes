# Recipes

A small cookbook website for the recipe cards in `/mnt/exdrive/docs/recipes`: a search box, every recipe
listed by collection, and one clean page per recipe, made to be read on a phone in the middle of cooking.
No ads, no life stories, just the recipe.

## Running it

The site runs all the time as a user service named `recipes`, at **http://recipes.local** for any phone
or tablet on the same Wi-Fi (http://j-desktop.local reaches it too). It starts with the desktop and needs
nobody logged in.

Cards reload on their own: save one and the next page load shows it. Code doesn't, so after changing the
code, run `bun run deploy` to build everything and restart the service.

| Command | What it does |
|---|---|
| `bun run deploy` | Builds everything, then restarts the service so it runs the new build. |
| `bun run dev` | For working on the code: Go on port 8686 and Vite on 5173. Open `http://localhost:5173`, and pages reload as you edit. The service on port 80 keeps running alongside. |
| `bun run build` | Typechecks, builds the website into the server, then builds `bin/recipes`. |
| `bun run check` | Reads every card and lists every problem. Exits 1 if there are any. |
| `bun run test` | The website's tests, then the server's. |
| `bun run start` | Runs `bin/recipes` by hand. Stop the service first, since both want port 80. |

Looking after the service:

```bash
systemctl --user status recipes     # is it up?
systemctl --user restart recipes    # restart it
journalctl --user -u recipes -f     # its output, as it happens
```

### Setting it up on another machine

```bash
bun install && bun run build
cp service/recipes.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now recipes
loginctl enable-linger "$USER"
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/60-recipes-port-80.conf && sudo sysctl -p /etc/sysctl.d/60-recipes-port-80.conf
```

`enable-linger` starts the service at boot without anyone logging in. The last line lets ordinary programs
use port 80, which Linux otherwise keeps for admins. The service file and `config.yaml` hold absolute paths
to this folder and the recipes folder, so update them if either lives somewhere else. The name needs Avahi
(`avahi-daemon`), which most Linux desktops already run, and no setup of its own.

## How a page gets to the screen

1. **The cards are YAML files on disk**, one per recipe. `_template.yaml` in the recipes folder defines
   the format.
2. **The Go server reads them** (`server/internal/cards`). It decodes each card strictly, checks it
   against the format's rules, renders its markdown to HTML, and points links between recipes at their
   pages. Anything wrong becomes a problem naming the file and saying what to fix, and every good card
   still loads.
3. **It serves them as JSON** (`server/internal/api`). `GET /api/recipes` lists every recipe along with
   every problem, and `GET /api/recipes/{name}` returns one recipe, ready to show.
4. **The website is a React app** (`web/`), built once into `server/internal/site/dist` and baked into
   the Go binary. Any address that isn't a file or under `/api` gets the app's page, and the app decides
   what that address shows.
5. **The browser does the rest.** The app fetches the JSON and draws the page. Search runs in the
   browser over the list it already has, which is why it keeps up with every keystroke.

The server compares the cards' sizes and modified times on every request, and reads the folder again
when anything changed. A new or edited card shows up on the next page load, without a restart.

## Cooking from a recipe

A recipe page is built to cook along with, not just to read:

- **Tap to check things off.** An ingredient gets ticked and crossed out; a step fades back with a tick in
  its number. The next step to do waits in a highlighted card with its number glowing.
- **The quest tracker** is pinned to the bottom: the next step's lead (tap it to scroll there), a rainbow
  bar that fills as steps get done, and a way to start over. Finishing the last step throws a confetti
  party, once; reopening a finished recipe just shows it finished.
- **Every time in the method is a timer.** "8 to 10 minutes" becomes a button, and tapping it starts a
  countdown for the low end of the range, named after its step. Running timers ride along in the tracker,
  soonest first, and chime when they're done.
- **On a tablet**, the ingredients get a column of their own that stays put while the steps scroll.

All of it is kept in the browser, per recipe, in localStorage, so a reload or a trip to another page picks
up where the cook left off. Progress goes stale after a day, and a timer is forgotten an hour after it
rang. Nothing about cooking reaches the server, and nothing in it changes the cards.

**Two limits come from the browser, not the site.** Keeping the screen on uses the Screen Wake Lock API,
which browsers only allow on secure pages (https, or localhost), so over plain `http://recipes.local` the
screen dims as usual and the tracker's "screen on" marker never shows. And a phone that locks pauses the
page, so a timer that ends while it's locked chimes the moment the phone is unlocked rather than on time.

## How phones find recipes.local

Names ending in `.local` aren't looked up in DNS. A phone asks the whole Wi-Fi "who's recipes.local?",
and Avahi, the program that already answers for `j-desktop.local`, answers with this machine's address.
The server asks Avahi to do that once it's listening (`server/internal/announce`), and checks every 10
seconds that Avahi still is, so the name comes back by itself after a reboot, an Avahi restart or a new
address from the router. When the server stops, Avahi stops answering.

Only a server other devices can reach announces the name. `bun run dev` listens on `127.0.0.1`, so it
never claims the name the always-on copy holds. The service's log (`journalctl --user -u recipes`) says
when the name is announced, and what went wrong if it can't be.

## Configuration

`config.yaml` holds three settings:

| Key | Meaning |
|---|---|
| `recipesFolder` | Where the cards live. A relative path is read from the config file's folder. |
| `listen` | The address to listen on. This config uses `0.0.0.0:80`; without the setting, it's `0.0.0.0:8686`. |
| `name` | The site's name on the Wi-Fi, like `recipes.local`. It has to be one word and `.local`, since phones and laptops won't look up a longer one. Without it, nothing is announced, and the site goes by the machine's own name. |

## Collections and search

A card at the top level of the recipes folder is listed under Home Cooking. A card one folder down
belongs to a collection named after that folder, so `star-ocean/au-gratin-climax.yaml` is listed under
Star Ocean. Cards any deeper aren't read, and `check` says so.

Search looks at each recipe's title, tags and collection. Every word has to match, and words match
partway through, so `beef dinner` finds recipes that are both, and `chori` already finds the chorizo.

## Where things live

| Path | What it is |
|---|---|
| `server/cmd/recipes` | The program, with its two commands: `serve` (the default) and `check` |
| `server/internal/cards` | Reading, checking and rendering the cards |
| `server/internal/api` | The JSON API, and routing everything else to the website |
| `server/internal/site` | Serving the built website from inside the binary |
| `server/internal/config` | Reading `config.yaml` |
| `server/internal/announce` | Getting Avahi to answer for the site's name on the Wi-Fi |
| `service/recipes.service` | The always-on service, copied into `~/.config/systemd/user/` |
| `scripts/app-icon.html` | The home-screen icon, which the PNGs in `web/public` are screenshots of |
| `web/src/services` | Search, collection grouping, link handling, the API client, and everything cooking runs on (progress, timers and finding times in a step, the tracker's words, confetti physics, the chime), as plain tested functions |
| `web/src/hooks` | The glue between those services and the browser: loading a recipe, saving progress, ticking timers, the screen wake lock |
| `web/src/pages`, `web/src/components` | The pages and their pieces, kept free of logic. `CookingRecipe` puts a recipe, its tracker and its confetti together |
| `web/test` | The website's tests |
