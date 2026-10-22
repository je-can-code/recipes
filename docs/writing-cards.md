# Writing recipe cards

How a recipe card should read, for anyone writing one, person or agent. The format itself is defined by
`_template.yaml` in the cards folder; this is everything the format can't say.

## Before you start

- Read `_template.yaml`. It defines every field, in comments.
- Read three finished cards for the voice: `prehistoric-meat.yaml` (a made-up dish, interpreted),
  `rice-omelet.yaml` (a real dish behind a game's name) and `fruit-punch.yaml` (a drink). All three come with
  the starter cards.

## The format's traps

- One card per file, named after its title: lowercase, apostrophes and periods dropped, and every other run
  of characters that aren't letters or digits becomes one hyphen. `10 oz. Steak` is `10-oz-steak.yaml`, and
  `Shark's Fin Bun` is `sharks-fin-bun.yaml`.
- Prose (the intro, a step's text, `before`, `after`, a note's text) goes in a `>-` folded block.
- Quote any one-line value that contains `: ` or ends with `:`. Note leads often end in a colon, so they
  need it: `lead: "Too thick:"`.
- Exactly one of `serves` or `makes`.
- Link to another card by its slug, `[Salt Rice Ball](salt-rice-ball)`, and only to a card that exists.
  The check command fails on a link to nothing.

## Voice

- A recipe card, not a blog post. The intro is two to four sentences: what the dish is, and why it works. A
  fact about a dish's region or history goes in only after you've checked it.
- Every step opens with a short lead in the imperative, ending in a period ("Sear the steak."), then the
  rest of the step.
- Steps carry the cues a cook needs to know it's working: what it looks like, sounds like, smells like, or
  reads on the thermometer.
- Two to five notes for fixes, swaps, making ahead and storage, each with a short lead.
- Units: tsp, tbsp, cup, oz, lb, °F, and fractions like 1/2.
- `time:` reads the way a person says it: "about 45 minutes", "about 10 minutes, plus chilling", "about 1 hour
  15 minutes".
- In the method, write every duration as a number: "5 minutes", "8 to 10 minutes", "1 hour". Never "a few
  minutes" when the number is known. The site turns each one into a tap-to-start timer.
- No em-dashes, no `--` standing in for one, and no emoji.

## Game cards

- The title is the in-game name, as the game spells it, unless two games use it for different dishes (see
  below). Fix only a plain typo in the source list.
- The intro names the real dish behind it: omurice, kaki zoni, manga niku.
- Where the game lists a dish's ingredients, build the real recipe on them, and swap anything made up or
  impossible to buy for the nearest real thing.
- A made-up dish gets a real-world take you would actually cook, and its intro opens with "An
  interpretation." Playful is welcome; edible is required.
- Tags list the food first, then `game`, the series and the game itself:
  `tags: [ chicken, dinner, game, star-ocean, so1 ]`, or `tags: [ pork, dinner, game, tales, arise ]`. Every
  card from a game carries `game`. Reuse these food tags before inventing a new one: beef, pork, chicken,
  seafood, egg, vegetarian, rice, noodles, soup, salad, side, sauce, dessert, baking, drink, breakfast,
  brunch, lunch, dinner, snack.
- Give every card at least one course tag (breakfast, brunch, lunch, dinner, soup, salad, side, sauce,
  snack, baking, dessert or drink). Every shelf lists its recipes under those headings.
- A game gets a shelf of its own from an entry in `_collections.yaml` in the cards folder, keyed by the
  game's tag; until it has one, its cards sit on Home Cooking. Leave that file to whoever runs the batch,
  since writers work side by side.

## A dish from more than one game

- The same dish stays one card, even when another game calls it something else. Add the new game's tags,
  and make sure the intro names each game it talks about, so nothing reads as true of only one of them.
- When two games use one name for two different dishes, each gets its own card, and both titles say which
  is which: two Hamburgers, one beef and one lamb, become Beef Smash Burger and Decadent Lamb Burger. Tag
  both with the in-game name (`hamburger`), since search reads titles and tags and would otherwise lose it.
- When versions of a dish differ only by the meat, write one card that offers each meat, with whatever
  changes for each one, usually the cooking time.
- When a game serves a fancier version of a dish that already has a card, like Deluxe Sushi beside Sushi, it
  gets a note on that card rather than a card of its own, even when that makes a sixth note. The lead names
  the dish and its game, `lead: "Deluxe Sushi (SO6):"`, and the text says how to take the card's recipe there.
- When the fancier version changes how the dish is made, like a pasta served cold or a stir-fry under a new
  sauce, it gets a short card of its own that builds on the base.
- A dish built on another, like a bun filled with a game's curry, links to that card for the shared part
  and writes out the rest.

## A card that scales

The page can make a recipe from a quarter to four times as big, and show every amount in US or metric
measures. It can only scale what it can see, so a card that scales keeps its amounts where the page looks.

- Say `scales: true` once the card is written this way. Leave it out for anything a pan or a mold decides,
  like a cake, a pie, a tart or a loaf, and for rice cooked in a pot by absorption, like a pilaf. Cookies,
  buns, skewers and anything else made by the piece scale fine, since each piece stays the same size. Rice
  in a rice cooker scales too, since the cooker has a line for each amount: write it as
  `{2 rice cooker cups}`, so metric keeps the cooker's cups.
- Amounts live in the ingredients. Start each line with its amount ("1 lemon, juiced", not "Juice of 1
  lemon"), put the counted thing right after a count ("2 chicken thighs, boneless and skinless"), give each
  amount its own line ("1 tbsp butter" and "1 tbsp neutral oil", not both on one), and write a package's size
  with "each": "1 can (14.5 oz each) diced tomatoes". A length never scales, so a line that would lead with
  one leads with a count of pieces instead: "1 piece ginger, 2 inches long".
- Give a key to each ingredient a step or note points at: `3 cups water {water}`. Name it the way it reads
  after "the": `{olive-oil}` is "the olive oil", and `{Sichuan-pepper}` keeps its capital.
- Point at an ingredient where a step adds or measures it: "Pour in {sake}, then {water}." The page shows
  "the sake (1 tbsp)", so a pointer brings its own "the": never write "the {sake}". Later mentions in the
  same step are plain words. A share does the math for the cook:
  `{half water}`, `{third water}`, `{quarter water}`, `{eighth water}`, `{double water}`, `{rest water}`, or a
  fraction like `{2/3 water}`.
- Put any other amount that grows with the recipe in braces: a yield ("about {2/3 cup} of puree"), a part set
  aside ("set {2 tbsp} of it aside"), a seasoning check ("it usually wants about {1 tsp} salt"), a count of
  pieces ("divide it into {4 portions}"), and a note's swap ("use {1 lb} thinly sliced pork"). A range in
  braces says "to", like `{1 to 2 tbsp}`, and every fraction is a kitchen one, in halves, thirds, quarters,
  eighths or sixteenths. Plates, bowls and glasses become "the plates, one per person".
- Leave an amount that's per piece plain, and say so in its sentence: "about 1/3 cup of rice per ball", "add
  water 1 tbsp at a time", "beat 3 eggs for each omelet". The check lets "per", "each", "apiece" and "at a
  time" through, for the whole sentence, so keep a per-piece sentence to the per-piece amount.
- Amounts in an ingredient line's parentheses grow with the batch, unless the parentheses say "each", "per" or
  "apiece", or give a percent: "(about 2 limes)" doubles, while "(14.5 oz each)", "(16 to 20 per lb)" and
  "(60 to 70% cacao)" stay put.
- Some lines stay the same at any size, and they name the thing first so the page leaves their amount alone:
  oil for frying, since the pot and the depth decide it ("Neutral oil for frying, 6 to 8 cups, enough for 2
  inches in your pot"), and each line of a group for one glass or one mug ("Syrup, 1/4 cup"), whose steps say
  "each glass" while the syrup itself scales. Gear counts go in words: "Two small pots".
- Write a pan's or a cut's size with a hyphen, so it never reads as an amount: "a 6-quart pot", "a 12-inch
  skillet", "1/2-inch cubes".
- Times stay as they are. Heat soaks in by thickness, not by how much is in the pan, so a bigger batch cooks
  for about the same time, and a step's cues ("until it coats a spoon") carry the rest.
- No braces in a lead or the intro; the page shows those as they are.

## The kitchen

- A glass electric flattop. No cast iron; the elements cycle and lag behind the dial, and water is slow to
  boil. Put lids on pots and be generous with times.
- A weak oven. Preheat for 20 minutes, longer than the beep says.
- A 12-inch stainless skillet (All-Clad). To sear, preheat the empty pan in the oven first.
- An air fryer, which is the answer to the weak oven for small, crisp things. A small Zojirushi rice cooker
  that makes 2 rice cooker cups at most, enough for four. An instant-read thermometer.
- No microwave, ever. Never write a step that needs one.
- No blender, stand mixer, food processor, juicer or ice cream maker is confirmed. A card that leans on
  one is written for it, with a note giving a fallback where there is one: shake it in a jar, whisk it,
  mash it, or freeze it and stir.
- Shopping: Uwajimaya for Japanese and other Asian ingredients, QFC and Safeway for the rest. Their steaks
  are mostly thin-cut. For anything rare, say where to look and what to ask for, rather than promising a
  store stocks it.

## Tastes

- No raw or runny egg on rice: no raw yolk, no onsen egg, no tamago kake gohan. A set egg is fine where it
  earns its place.
- Mushrooms only where the dish is about them.
- No shellfish, and no ikura, unless the dish is about them. Where a recipe usually has some, leave it out
  or offer it as an optional line.
- Drinks are non-alcoholic, always. Cooking sake and mirin are fine in cooking. Where a dish wants wine,
  the non-alcoholic route is the main one.
- Something crisp scattered over something soft is a favorite move.
- Hot meat with a pan sauce over greens is a favorite shape.

## Writing a batch

1. Read the template and the three example cards.
2. Write each card with `Write`. Look up what you would otherwise guess (an unfamiliar dish, a fact for an
   intro, where an ingredient is sold in Seattle), and skip lookups for what you already know well.
3. Run the check command: `bun run check` in this repository, or `recipes check` beside a downloaded
   program. It reads every card the way the site does and lists every problem. Fix problems in your own
   files only, since others may be writing cards at the same time.
4. Never change an existing card, the template or the site's code. New cards show up on the site by
   themselves, so nothing needs deploying.
