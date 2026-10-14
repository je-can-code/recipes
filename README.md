# Recipes

A small cookbook website for the recipe cards in `/mnt/exdrive/docs/recipes`: a search box, every recipe
listed by collection, and one clean page per recipe, made to be read on a phone in the middle of cooking.
No ads, no life stories, just the recipe.

## Running it

```bash
bun install
bun run build    # checks the types, builds the website, and builds bin/recipes with the site inside it
bun run start    # serves on port 8686
```

Then open `http://<this machine's address>:8686` on any phone or tablet on the same Wi-Fi.

| Command | What it does |
|---|---|
| `bun run dev` | Runs the Go server and Vite together. Open `http://localhost:5173`, and pages reload as you edit. |
| `bun run build` | Typechecks, builds the website into the server, then builds `bin/recipes`. |
| `bun run start` | Runs `bin/recipes` with `config.yaml`. |
| `bun run check` | Reads every card and lists every problem. Exits 1 if there are any. |
| `bun run test` | The website's tests, then the server's. |

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

## Configuration

`config.yaml` holds two settings:

| Key | Meaning |
|---|---|
| `recipesFolder` | Where the cards live. A relative path is read from the config file's folder. |
| `listen` | The address to listen on. Defaults to `0.0.0.0:8686`, which phones on the network can reach. |

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
| `web/src/services` | Search, collection grouping, link handling and the API client, as plain tested functions |
| `web/src/pages`, `web/src/components` | The pages and their pieces, kept free of logic |
| `web/test` | The website's tests |
