# Anime Legends

Anime Legends is a single-player arcade fighting game by Aun Abbas. Start as Blaze Warrior, face a CPU rival, and earn Spirit Shards to unlock the other nine elemental fighters. Play with a keyboard or touchscreen in a modern browser. [Play on Netlify](https://anime-legends-by-aun-abbas.netlify.app/)

![Anime Legends cover art](media/arena-cover.webp)

## How to play

Choose **Enter the arena**, then **Choose fighter**. Pick a difficulty and match health, check your opponent, and select **Fight**. Land hits to build power. Walk into a weapon drop to equip it. The arena can drop a Katana, Spirit Bow, Chaos Orb, Shadow Blade, or Thunder Gauntlet.

Land another unblocked punch within 1.5 seconds of combat time to keep your combo going. The results screen shows your longest combo from the match alongside your personal best on this device.

| Mode | How it plays |
| --- | --- |
| Timed match | Choose 100, 200, 300, or 400 HP. Win by knockout or by finishing the round with a higher percentage of health remaining. Equal health at the bell is a draw. |
| Expert | In a timed Expert match, knocking out the opponent brings out their stronger final boss form. |
| Survival | Select **Survival ∞** under match health. Face waves of stronger opponents and recover some health between waves. A knockout ends your run. To bank your current score early, open **Pause** and choose **Finish survival**. |

### Controls

| Action | Keyboard | Touchscreen |
| --- | --- | --- |
| Move | Left / right arrow | Drag the stick left / right |
| Jump | Up arrow | Drag the stick up |
| Light / heavy attack | `Z` / `X` | Tap **Light** / **Heavy** |
| Block | Hold `C` | Hold **Block** |
| Dash | `Space` | Tap **Dash** |
| Special, one power orb | Tap `V` | Tap **Power** |
| Ultimate, three power orbs | Hold `V` | Hold **Power** |
| Pause / resume | `Esc` | Tap **Pause** / **Resume** |

### Fighter roster

| Fighter | Element | Special | Ultimate |
| --- | --- | --- | --- |
| Blaze Warrior | Fire | Inferno Burst | Solar Flare |
| Shadow Ninja | Dark | Shadow Step | Thousand Shadows |
| Storm Fighter | Lightning | Thunder Crash | Divine Lightning |
| Frost Knight | Ice | Ice Spike | Glacial Zero |
| Terra Golem | Earth | Rock Smash | Earthquake |
| Aero Dancer | Wind | Gale Blade | Tornado Strike |
| Iron Brawler | Metal | Steel Punch | Meteor Crater |
| Venom Viper | Poison | Toxic Fang | Venomous Cloud |
| Aqua Siren | Water | Water Whip | Tsunami Surge |
| Soul Reaper | Spirit | Phantom Scythe | Soul Harvest |

### Progress and scores

A completed match earns one Spirit Shard for every 100 points. Spend shards in the **Spirit shop** on fighters, weapon skins, and boosts. Once purchased, a boost can be equipped again for free. You can equip two at a time.

Your browser saves your shards, purchases, equipped items, and ten highest scores in local storage for the site. Return using the same browser profile and site address to keep playing with your unlocks. Clearing the site's stored data clears your progress. When storage is unavailable, you can play and earn rewards for the current session.

## Run locally

Use Node.js 24.15 or a later 24.x release, with its bundled npm. The repository includes an `.nvmrc` for Node version managers.

```sh
git clone https://github.com/AunMohammad254/anime-legends.git
cd anime-legends
npm ci
npm run dev
```

Open the local URL printed by Vite. The root path opens the landing page and `/game.html` opens the game. To test the touch controls on a phone over your local network, run `npm run dev -- --host` and open Vite's network URL on the phone.

## Verify a release

From a clean checkout, run these commands from the repository root.

```sh
npm ci
npm run test:coverage -- --run
npm run build
npm run test:dist
npx playwright install chromium firefox webkit
npm run test:browser
```

The browser suite starts Vite's preview server on port 4173 and exercises the built game in desktop Chromium and Firefox, plus touch-emulated Chromium and WebKit. On a fresh Linux runner, use `npx playwright install --with-deps chromium firefox webkit` to install the browsers' system libraries too. For a manual playthrough, run `npm run preview` after the build.

GitHub Actions runs the unit suite and builds the game on Linux and Windows. Both runners check that each built page, its links, and its local assets resolve under a deployment subdirectory. The browser jobs use the same Linux build for keyboard and touch playthroughs, a timed knockout, pausing and restarting, shopping, cross-tab saves, blocked storage, and menu navigation.

The Linux unit suite requires 100% line, statement, branch, and function coverage for each measured application JavaScript file. Open **unit-coverage** on the workflow run to inspect the V8 report. A failed browser job provides a **browser-failures** artifact for its engine with an HTML report, traces, and screenshots. Once all jobs pass, **anime-legends-dist** contains the build that the browsers tested. Checks run on pull requests, pushes to `main`, and manual runs. [Release checks](.github/workflows/check.yml)

## Deploy to Netlify

The production build is a static site. It includes the landing page, the game, and their assets. The game runs entirely in the player's browser.

1. In Netlify, open the existing Anime Legends project. For a first deployment, import the GitHub repository into a new project.
2. Set the production branch to `main` and the base directory to the repository root. The repository config sets the build command to `npm run build` and the publish directory to `dist`. Use Node.js 24.15 or a later 24.x release for the build.
3. Put the tested release on the production branch. Run or approve the production deploy in Netlify according to your project's publishing settings.
4. Open the deployed home page in a fresh browser session. Choose **Enter the arena**, complete a fight, then reload and check the leaderboard. Use the deployed project's HTTPS URL to share the game.

If you deploy manually, upload the contents of the verified `dist/` build, including both HTML files and the assets directory. [Netlify build configuration](netlify.toml)

## Project structure

| Path | Contents |
| --- | --- |
| `index.html`, `landing.js`, `landing.css` | Public landing page and gameplay preview |
| `game.html`, `main.js`, `index.css` | Game screens, startup, and arena styling |
| `engine.js`, `src/` | Battle loop, fighters, AI, input, sound, effects, UI, and saved state |
| `constants.js` | Fighter roster, weapons, skins, and boosts |
| `media/` | Artwork, font, and gameplay video |
| `tests/`, `e2e/` | Unit tests and browser release checks |

## Contributing

Fork the repository, create a feature branch, and open a pull request against `main`. Keep changes focused and include the checks you ran. For a gameplay bug, include your browser, device, mode, and steps to reproduce it. [Report a bug](https://github.com/AunMohammad254/anime-legends/issues) · [Contributors](https://github.com/AunMohammad254/anime-legends/graphs/contributors)

Created by **Aun Abbas**. [GitHub](https://github.com/AunMohammad254) · [Twitter](https://twitter.com/AunMohammad254) · [LinkedIn](https://linkedin.com/in/aunmohammad)

The game code is distributed under the MIT License. The bundled Barlow Condensed font uses the SIL Open Font License. [MIT License](https://opensource.org/license/mit/) · [Font license](public/licenses/barlow-condensed.txt)
