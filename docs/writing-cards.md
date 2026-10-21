# Writing recipe cards

How a recipe card should read, for anyone writing one, person or agent. The format itself is defined by
`_template.yaml` in the cards folder; this is everything the format can't say.

## Before you start

- Read `_template.yaml`. It defines every field, in comments.
- Read three finished cards for the voice: `prehistoric-meat.yaml` (a made-up dish, interpreted),
  `lords-ozoni.yaml` (a real regional dish) and `fruit-punch.yaml` (a drink).

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
- A dish built on another, like a bun filled with a game's curry, links to that card for the shared part
  and writes out the rest.

## The kitchen

- A glass electric flattop. No cast iron; the elements cycle and lag behind the dial, and water is slow to
  boil. Put lids on pots and be generous with times.
- A weak oven. Preheat for 20 minutes, longer than the beep says.
- A 12-inch stainless skillet (All-Clad). To sear, preheat the empty pan in the oven first.
- An air fryer, which is the answer to the weak oven for small, crisp things. A Zojirushi rice cooker. An
  instant-read thermometer.
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
