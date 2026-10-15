# Recipes

A small cookbook website for the recipe cards in `/mnt/exdrive/docs/recipes`: a search box, every recipe
listed by collection, and one clean page per recipe, made to be read on a phone in the middle of cooking.
No ads, no life stories, just the recipe.

## Running it

The site runs all the time as a user service named `recipes`, at **https://recipes.local** for any phone
or tablet on the same Wi-Fi (j-desktop.local reaches it too). It starts with the desktop and needs nobody
logged in. A device's first visit goes to **http://recipes.local/trust**, which walks it through trusting
the site's certificate; see [https](#https) below. After one visit at home, a device keeps its own copy of
the site and every recipe, so it opens away from home too; see [Away from home](#away-from-home).

Cards reload on their own: save one and the next page load shows it. Code doesn't, so after changing the
code, run `bun run deploy` to build everything and restart the service.

| Command | What it does |
|---|---|
| `bun run deploy` | Builds everything, then restarts the service so it runs the new build. |
| `bun run dev` | For working on the code: Go on port 8686 and Vite on 5173. Open `http://localhost:5173`, and pages reload as you edit. The service on port 80 keeps running alongside. |
| `bun run build` | Typechecks, builds the website and its service worker into the server, then builds `bin/recipes`. |
| `bun run check` | Reads every card and lists every problem. Exits 1 if there are any. |
| `bun run certs` | Makes the https certificates the first time, and renews the site's certificate after that. Restart the service to use them. |
| `bun run test` | The website's tests, then the server's. |
| `bun run start` | Runs `bin/recipes` by hand. Stop the service first, since both want ports 80 and 443. |

Looking after the service:

```bash
systemctl --user status recipes     # is it up?
systemctl --user restart recipes    # restart it
journalctl --user -u recipes -f     # its output, as it happens
```

### Setting it up on another machine

```bash
bun install && bun run build && bun run certs
cp service/recipes.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now recipes
loginctl enable-linger "$USER"
echo 'net.ipv4.ip_unprivileged_port_start=80' | sudo tee /etc/sysctl.d/60-recipes-port-80.conf && sudo sysctl -p /etc/sysctl.d/60-recipes-port-80.conf
```

`enable-linger` starts the service at boot without anyone logging in. The last line lets ordinary programs
use ports 80 and 443, which Linux otherwise keeps for admins. The service file and `config.yaml` hold absolute paths
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
6. **A service worker stands in between** on every device. It passes each request to the server and
   saves what comes back, and answers from that copy when the server can't be reached. See
   [Away from home](#away-from-home).

The server compares the cards' sizes and modified times on every request, and reads the folder again
when anything changed. A new or edited card shows up on the next page load, without a restart.

## Cooking from a recipe

A recipe page is built to cook along with, not just to read:

- **Tap to check things off.** An ingredient gets ticked and turns bold, since it's on the counter and still
  has to be read as the steps call for it; a step fades back with a tick in its number. The next step to
  do waits in a highlighted card with its number glowing.
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

**The screen stays on mid-cook**, from the first checkmark to the last step or while a timer runs, and the
tracker says "screen on" while it does. That's the Screen Wake Lock API, which browsers only allow on secure
pages, which is why the site runs on https. It also keeps timers honest: a phone that locks pauses the page,
so a timer that ends while it's locked can only chime once the phone is unlocked. An older device without
the API just dims as usual.

## https

Browsers only treat a page as secure when they trust whoever signed its certificate, and no public
authority signs for a name like `recipes.local`. So the site has a certificate authority of its own
(`server/internal/certs`), which signs the site's certificate, and each device trusts that authority once.

- **`bun run certs`** makes the authority the first time (`certs/ca.crt` and `certs/ca.key`), then
  issues the site's certificate (`certs/site.crt` and `certs/site.key`) for `recipes.local`,
  `j-desktop.local` and `localhost`. Restart the service to pick up a new one.
- **Plain http stays up beside https** (`server/internal/trust`). It sends every visit on to the same
  page on https, except for the two things a device needs before it can open https at all: the trust
  page at **http://recipes.local/trust**, and the authority to download at `/ca.crt`. The redirect is
  temporary on purpose: browsers keep permanent ones forever, and if https ever broke, they'd lock
  plain http away too.
- **Adding a device:** open http://recipes.local/trust on it and follow the steps for that kind of device.
  On an iPhone or iPad that's installing a profile, then turning it on under Certificate Trust Settings.
  Until then, that device gets a warning on https.
- **Renewing:** Apple won't accept a certificate from a self-made authority that lasts longer than 825
  days, so the site's lasts 800. The service log says when it runs out. Run `bun run certs` and restart
  before then. The authority itself lasts ten years and is kept across renewals, so no device ever has to
  trust anything new.
- **The authority's private key is the one secret here.** A device that trusts the authority would believe
  any certificate it signs, for any website, so `certs/ca.key` is readable only by its owner, is ignored by
  git, and never leaves this machine.

Development (`bun run dev`) listens on loopback and stays on plain http.

## How phones find recipes.local

Names ending in `.local` aren't looked up in DNS. A phone asks the whole Wi-Fi "who's recipes.local?",
and Avahi, the program that already answers for `j-desktop.local`, answers with this machine's address.
The server asks Avahi to do that once it's listening (`server/internal/announce`), and checks every 10
seconds that Avahi still is, so the name comes back by itself after a reboot, an Avahi restart or a new
address from the router. When the server stops, Avahi stops answering.

Only a server other devices can reach announces the name. `bun run dev` listens on `127.0.0.1`, so it
never claims the name the always-on copy holds. The service's log (`journalctl --user -u recipes`) says
when the name is announced, and what went wrong if it can't be.

## Away from home

recipes.local only exists on the home Wi-Fi, so anywhere else a phone can't reach the desktop at all. The
site opens anyway, because every device keeps its own copy of the app and every recipe.

- **A service worker keeps the copy** (`web/src/worker`). It's the part of a site that a browser keeps on
  the device and runs by itself, between the page and the network. A build's files are saved the first
  time the build loads, and the catalog and every recipe are saved beside them, so any recipe opens
  anywhere, even one that was never opened at home.
- **The desktop goes first.** A page, the catalog or a recipe comes from the desktop when it answers
  within two seconds, and is saved for later. When it doesn't, the saved copy answers, and for the next
  five minutes the copy answers straight away, so only the first tap away from home has to wait. The
  desktop is still asked behind every answer, and as soon as it replies, everything comes from it again.
- **Opening the list refreshes every saved recipe**, at most once a minute, and forgets the ones whose
  cards are gone. Checkmarks and timers already live on the device, so cooking needs nothing from the
  desktop.
- **New builds reach devices by themselves.** `scripts/build-worker.ts` names each build after its
  contents and writes that name into `sw.js`. Browsers check `sw.js` whenever the site opens, and a changed
  one installs the new build and deletes the old one's files. A rebuild that changed nothing keeps its name,
  so devices have nothing to download.
- **A recipe that was never saved**, like one added while the device was away, says so instead of
  showing a blank page.

Development (`bun run dev`) has no service worker, since a copy there would get in the way of Vite
reloading the pages.

**On an iPhone or iPad, open it from the Home Screen.** Open https://recipes.local in Safari, tap Share,
then Add to Home Screen, and leave Open as Web App on. Open it once at home, and from then on it opens
anywhere. That matters for two reasons. Safari clears a website's saved data once about a week of browsing
has gone by without a visit, but a Home Screen web app only counts the days it's actually used, so its copy
stays. And other iPhone browsers, Brave among them, may not run service workers in their tabs at all. The
Home Screen app keeps its own checkmarks and timers, apart from the browser's. An icon added before the
site moved to https still points at the old address, so replace it.

## Configuration

`config.yaml` holds five settings:

| Key | Meaning |
|---|---|
| `recipesFolder` | Where the cards live. A relative path is read from the config file's folder. |
| `listen` | The address plain http listens on. This config uses `0.0.0.0:80`; without the setting, it's `0.0.0.0:8686`. |
| `name` | The site's name on the Wi-Fi, like `recipes.local`. It has to be one word and `.local`, since phones and laptops won't look up a longer one. Without it, nothing is announced, and the site goes by the machine's own name. |
| `certificates` | The folder `bun run certs` keeps the certificates in, read from the config file's folder when relative. Without it, the site runs on plain http alone. |
| `listenSecure` | The address https listens on, `0.0.0.0:443` unless it says otherwise. |

## Collections and search

A card at the top level of the recipes folder is listed under Home Cooking. A card one folder down
belongs to a collection named after that folder, so `star-ocean/au-gratin-climax.yaml` is listed under
Star Ocean. Cards any deeper aren't read, and `check` says so.

Search looks at each recipe's title, tags and collection. Every word has to match, and words match
partway through, so `beef dinner` finds recipes that are both, and `chori` already finds the chorizo.

## Where things live

| Path | What it is |
|---|---|
| `server/cmd/recipes` | The program, with its three commands: `serve` (the default), `check` and `certs` |
| `server/internal/cards` | Reading, checking and rendering the cards |
| `server/internal/api` | The JSON API, and routing everything else to the website |
| `server/internal/site` | Serving the built website from inside the binary |
| `server/internal/config` | Reading `config.yaml` |
| `server/internal/announce` | Getting Avahi to answer for the site's name on the Wi-Fi |
| `server/internal/certs` | Making the certificate authority and the site's certificate |
| `server/internal/trust` | The plain-http side: the trust page, the authority download, and the redirect to https |
| `certs/` | This machine's certificates and the authority's private key, kept out of git |
| `docs/writing-cards.md` | How a card should read, beyond what `_template.yaml` defines: the voice, the kitchen and tastes the cards are written for, and how to write a batch of them |
| `service/recipes.service` | The always-on service, copied into `~/.config/systemd/user/` |
| `scripts/app-icon.html` | The home-screen icon, which the PNGs in `web/public` are screenshots of |
| `scripts/build-worker.ts` | Builds the service worker into the site as `sw.js`, after Vite has built the rest, with the build's name and file list written in |
| `web/src/worker` | The service worker. `policy.ts` and `strategies.ts` decide what's saved and when the copy answers, as plain tested functions, and `sw.ts` connects them to the browser. `tsconfig.worker.json` checks it against a worker's globals rather than a page's |
| `web/src/services` | Search, collection grouping, link handling, the API client, installing the service worker, and everything cooking runs on (progress, timers and finding times in a step, the tracker's words, confetti physics, the chime), as plain tested functions |
| `web/src/hooks` | The glue between those services and the browser: loading a recipe, saving progress, ticking timers, the screen wake lock |
| `web/src/pages`, `web/src/components` | The pages and their pieces, kept free of logic. `CookingRecipe` puts a recipe, its tracker and its confetti together |
| `web/test` | The website's tests |
