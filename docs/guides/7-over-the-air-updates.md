# Inventory AI — EAS Update: how the installed app updates itself

This is the complete reference for over-the-air updates in this project: what is configured, what
each command does, how to publish safely, how to prove an update arrived, and what still requires a
new build.

It replaces the earlier shorter version of this guide, and every command below was checked against
the CLI actually installed here (`eas-cli/24.7.0`, `expo-updates ~58.0.17`, Expo SDK 58). Two
commands in the previous version were wrong and are corrected here: `eas update:list` takes
`--branch`, not `--channel`, and `eas update:rollback` takes a **group id**, not a channel.

---

## 0. The short answer

**Saving a file does not update anything.** Code saved on this laptop is just code on this laptop.
An installed app changes in exactly three ways:

| You changed | What it takes to reach a phone |
|---|---|
| A screen, a sentence, a colour, a form rule, a new API call, a bug in `.ts`/`.tsx`, an image | **One command** — `eas update` — then the app picks it up on its next launches. No APK, no cable. |
| A native library, a permission, a config plugin, `app.json`'s native fields, the Expo SDK | **A new build**, so a new APK/AAB, and one install (or a store release). |
| A backend route, a permission, a database rule, an email template | **Neither.** Deploy the server; every installed app gets the new behaviour immediately. |

The phone stays installed for the first row. That is the whole feature.

Two things are worth saying plainly, because they are the two that surprise people:

1. **There is no "auto-publish".** Nothing leaves the laptop until you type `eas update`. That is a
   safety property, not a limitation: a save is a draft, a publish is a release.
2. **The app you installed decides what it can receive.** The channel (`preview` or `production`)
   and the runtime version (`1.0.0`) are compiled into the APK. An update published to another
   channel, or built for another runtime, is invisible to that install — by design.
3. **Nothing tells the person it happened.** There is no banner, dialog or "new version" screen.
   The new words simply appear the next time they open the app. §7A is about that, and about how
   to add a notice if you want one.

---

## 1. How it works in this project

### What is inside the app

`expo-updates` (declared at `~58.0.17` in [mobile/package.json](../../mobile/package.json)) is a
small native client compiled into every build. Each build ships with a copy of the JavaScript it was
compiled with — the **embedded bundle** — and the update client is what lets a different bundle
replace it at runtime.

### What happens on a launch

1. The native shell starts and reads the last update it accepted (or the embedded bundle if none).
2. `checkAutomatically: "ON_LOAD"` asks `https://u.expo.dev/607eca05-…` once, in the background,
   whether a newer update exists **for this channel and this runtime version**.
3. If one exists it downloads while the app you already have keeps running.
4. The downloaded bundle is used **the next time the app starts**. Not mid-session — a reload of the
   JavaScript can restart state, so the app never swaps under a person's hands.
5. `fallbackToCacheTimeout: 0` means the launch **never waits** for that check. No internet, no EAS,
   a slow provider: the app starts immediately with what is on the device. That is why an offline
   cold start behaves exactly as before.

A consequence worth knowing: **the first launch after a publish usually still shows the old screen.**
You have to close and reopen the app (twice if you count the check itself), or force-stop and start
it, exactly as §8 describes.

### The five words that decide who receives what

| Word | What it is here |
|---|---|
| **Channel** | A name compiled into the binary: `development`, `preview`, `production`. An install listens to exactly one. |
| **Branch** | Where an update group is stored. In this project each branch has the same name as its channel, which keeps the mapping obvious. |
| **Update group** | One publish: the Android bundle, its assets, a message, a commit and a group id. This is what you roll back or republish. |
| **Runtime version** | The compatibility label. Under `appVersion` policy it is `expo.version` — `1.0.0` today. Served only to installs with an **exact** match. |
| **Embedded bundle** | The JavaScript that came inside the APK. The fallback that always exists. |

Delivery is the intersection of those: a phone receives an update when its **channel** points at the
branch the update was published to **and** its **runtime version** equals the update's.

### What makes an install eligible (and what to fix if it is not)

A phone can receive updates only when all four of these hold. Each one has a different fix:

1. **The build contains `expo-updates`.** A build made before the package was added can never
   receive anything; it needs one new install, and then it is updatable forever after.
2. **The build was made from a profile with a channel** (`preview` or `production`). The channel is
   compiled in; a build without one listens to nothing.
3. **The runtime version matches the update.** Publish for `1.0.0` and installs on `1.0.0` get it;
   an install on `1.1.0` does not, and should not.
4. **The app is actually opened.** There is no push: an install that is never launched never checks.

Everything else — the APK/AAB sitting in the store, the phone's Android version, the account the
user is signed in to — is irrelevant to delivery.

---

## 2. What this project has configured, exactly

### `mobile/app.json` — the contract inside the binary

```json
"version": "1.0.0",
"runtimeVersion": { "policy": "appVersion" },
"updates": {
  "url": "https://u.expo.dev/607eca05-1175-43ed-86a0-1829e91c9531",
  "checkAutomatically": "ON_LOAD",
  "fallbackToCacheTimeout": 0
},
"extra": { "eas": { "projectId": "607eca05-1175-43ed-86a0-1829e91c9531" } }
```

- **`version` is the runtime label.** `appVersion` policy means the runtime version *is* this string.
  So: JavaScript-only change → publish, keep `1.0.0`. Native change → bump this, and the new build
  legitimately stops receiving updates built for the old runtime. That one manual rule is the price
  of the automatic label, and it is the only manual rule in the system.
- **`url` names this EAS project.** A publish into another project cannot be served here.
- **`ON_LOAD` + `0`** is the offline-first combination explained above.
- **`updates.enabled` is not set**, which means enabled. Do not set it to `false`: that would compile
  an app that ignores every future update.

### `mobile/eas.json` — which build listens where

```json
"cli": { "appVersionSource": "remote" },
"build": {
  "development":   { "developmentClient": true, "channel": "development", "android": { "buildType": "apk" } },
  "ios-simulator": { "extends": "development", "ios": { "simulator": true } },
  "preview":       { "distribution": "internal", "channel": "preview",
                     "android": { "buildType": "apk" },
                     "env": { "EXPO_PUBLIC_API_URL": "https://ai-inventory-l1mi.onrender.com" } },
  "production":    { "autoIncrement": true, "channel": "production",
                     "env": { "EXPO_PUBLIC_API_URL": "https://ai-inventory-l1mi.onrender.com" } }
}
```

- **Every profile has its own channel**, except `ios-simulator`, which deliberately shares
  `development` with the device build. Preview and production cannot collide; the channel is in the
  binary, not in a setting someone could forget.
- **`production` produces an AAB by default** (Play's format). `preview` produces an APK that `adb`
  can install. A rehearsal can temporarily set `"buildType": "apk"` on production — and must remove
  it again afterwards.
- **`autoIncrement` is on for production**, so each build gets a new Android `versionCode` from EAS.
- **`appVersionSource: "remote"`** means EAS owns the Android `versionCode` (currently **4**), not
  the `expo.version` used for the runtime label. Read the current numbers rather than assuming:

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx eas-cli build:version:get --platform android --profile production
```

### The test that guards all of it

[mobile/__tests__/ota-update-config.test.ts](../../mobile/__tests__/ota-update-config.test.ts) pins
the four things that would silently deliver the wrong bundle: `expo-updates` is installed,
`runtimeVersion` is a policy rather than a hand-typed literal, the update URL is this project, a
launch never waits on the network, and every profile has a channel with preview and production
distinct. If a future edit changes behaviour, `npm test` fails before a build does.

### Why not the automatic `fingerprint` policy

It was tried first, and a real build failed in the *Configure expo-updates* phase with two different
hashes (`6217b878…` on EAS, `e32953a7…` on the laptop). The cause is this project's dynamic
[mobile/app.config.js](../../mobile/app.config.js): it reads the Firebase configuration **file
paths** from EAS file variables, which exist only on the build runner, so the two sides hash
different projects. `appVersion` removes that class of mismatch. Do not "improve" it back.

---

## 3. The live state of the update service

Read from the account, not from memory. Re-check it before a release:

```bash
cd C:/Users/jeffe/inventory-ai/mobile

npx eas-cli channel:list                     # channels and what they point at
npx eas-cli branch:list                      # branches, newest group and its runtime
npx eas-cli update:list --branch production --limit 5   # recent publishes on a branch
```

At the time of writing:

| | `preview` | `production` |
|---|---|---|
| Channel | exists, active, **unprotected** (no code signing) | exists, active, **unprotected** |
| Branch | `preview` | `production` |
| Newest group | `6e14b317-…` | `936e1e55-…` — *Invitations, terms of use and the deletion audit scrub* |
| Runtime version | `1.0.0` | `1.0.0` |
| Android `versionCode` (remote) | — | **4** |
| What installs there | preview APKs you side-load | store builds, and the production-profile APK on the test phone |

Older production groups still exist (`d4582eda-…`, `2518ccb8-…`, the Google Sign-In fixes). They are
history and evidence; nothing prunes them automatically, and installs always move **forward** to the
newest group for their runtime.

**"Unprotected" means code signing is off.** It is available in this toolchain (the `expo-updates`
CLI here offers `codesigning:generate` and `codesigning:configure`) but it is **not enabled**, and
enabling it is a **build-time** change: the certificate is compiled into the app, so it must be turned
on before the store build, not after. See §11.

---

## 4. EAS environments: what the bundle is built with

`eas update` does not read `eas.json`'s build `env`. It reads the **EAS environment** named by
`--environment`. That distinction matters, because a bundle published without the production values
would still install and then reach no server.

The `production` environment currently holds these **public** variables (all `EXPO_PUBLIC_*`, all
visible in any bundle by definition — nothing secret may live here):

```text
EXPO_PUBLIC_API_URL
EXPO_PUBLIC_FIREBASE_API_KEY
EXPO_PUBLIC_FIREBASE_APP_ID
EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN
EXPO_PUBLIC_FIREBASE_PROJECT_ID
EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
```

Inspect before publishing:

```bash
npx eas-cli env:list --environment production
npx eas-cli env:list --environment preview
```

Two gotchas, both real:

- **`EXPO_PUBLIC_API_URL` is defined twice** — in the `production` environment *and* in the
  `production` build profile's `env`. The profile value wins for builds, and the CLI says so when
  you ask: *"The values from the build profile configuration will be used."* Keep the two identical
  so nobody has to reason about which one applied.
- **`mobile/lib/config.ts` falls back to `http://localhost:4000`** when the variable is absent. On
  2026-10-24 the production environment was missing it, and a production publish would therefore have
  reached no server. It is present now; the check above is how you confirm it still is.

To set or change one (values here are public by design):

```bash
npx eas-cli env:set --environment production \
  --name EXPO_PUBLIC_API_URL \
  --value https://ai-inventory-l1mi.onrender.com --visibility plaintext
```

Changing an `EXPO_PUBLIC_*` **value** is a native-build decision, not an OTA one: the value is
compiled into whatever bundle is served, so an update would carry the new value to some installs and
not others. Change it with a build.

---

## 5. The commands

All of these run from `C:/Users/jeffe/inventory-ai/mobile`. Flags shown are the ones this CLI
accepts — verified against `eas-cli/24.7.0`, which is what is installed (a newer CLI is available;
upgrading is safe but re-read `--help` afterwards, since flags do move between major versions).

### Publish an update

```bash
npx eas-cli update --channel preview --environment preview --platform android \
  --message "Say what changed"
```

| Flag | Why it is there |
|---|---|
| `--channel` | Which installs may receive it. This is the switch that matters. |
| `--environment` | **Required on SDK 55+.** Loads that EAS environment's variables. The CLI refuses without it; do not work around the refusal. |
| `--platform android` | **Always pass it.** Without it the command also exports the **web** bundle, which this project does not ship, and the publish fails before uploading (`expo-router` → `react-native-web`). |
| `--message` | The line you will read in `update:list` in six months. Write it for your future self. |

Useful extras: `--branch <name>` (defaults to the channel name), `--rollout-percentage 10`
(stage a release), `--clear-cache`, `--json`, `--non-interactive`, `--skip-bundler` +
`--input-dir dist` (publish a bundle you already exported), and `--private-key-path` (only with code
signing).

Publish to production — the real release:

```bash
npx eas-cli update --channel production --environment production --platform android \
  --message "Describe the release"
```

### Inspect what exists

```bash
npx eas-cli update:list --branch production --limit 10   # NOT --channel
npx eas-cli update:list --all --limit 20
npx eas-cli update:insights <group-id> --days 7          # launches, crashes, users, size
npx eas-cli channel:list
npx eas-cli branch:list
```

`update:list` prints, per group: platform, runtime version, message, code-signing key (N/A today),
roll-back-to-embedded flag, rollout percentage and the group id. `--json` gives the same as data.

### Republish (the remedy for a device that says "no update")

```bash
npx eas-cli update:republish --group <group-id> --message "Republished"
```

This re-publishes an existing group — same JavaScript, new group id — and in the measured case the
phone picked it up on the next launch. It is the first thing to try when `eas update:list` clearly
shows a newer group than the device is running (§9).

To raise a staged release to everyone:

```bash
npx eas-cli update:republish --group <group-id> --rollout-percentage 100
```

### Roll back

```bash
# To the update BEFORE this one (it must be the latest for its branch and runtime):
npx eas-cli update:rollback <group-id> --platform android -m "Rolled back"

# To the bundle compiled into the installed APK:
npx eas-cli update:roll-back-to-embedded --channel production --platform android \
  --runtime-version 1.0.0 --message "Back to embedded" --non-interactive
```

Two facts learned on this project's hardware:

- `update:rollback` takes the **group id**; `--channel` is not one of its flags.
- `roll-back-to-embedded` **needs `--runtime-version`** when run non-interactively, or the CLI
  refuses with *"--runtimeVersion is required in non-interactive mode"*. It was exercised on a
  production-profile build on 2026-10-24 and returned the phone to its embedded bundle after two
  cold launches.

Rollback publishes a *newer* group that contains the older code. Installs move to it on their next
launch — it does not reach into a phone and undo anything, and a phone that never launches again
keeps what it already downloaded.

### Delete a group

```bash
npx eas-cli update:delete <group-id>
```

This removes the group from the branch. It is not a recall: installs that already downloaded it keep
running it until a newer group supersedes it. For "stop serving this", publish a correction or a
rollback.

### Version and diagnostics

```bash
npx eas-cli build:version:get --platform android --profile production
npx eas-cli diagnostics                       # environment info for bug reports
npx expo config --type public --json          # what the native config actually resolves to
npx expo-updates runtimeversion:resolve       # the runtime label for this tree
```

---

## 6. The safe release procedure

The rule this project follows: **nothing is published that has not been verified, and nothing reaches
production before it has been proven somewhere else.**

1. **Be on the commit you mean to ship.** `git status` clean, `git log -1` is the intended commit.
   EAS records the commit in the update, so this is what makes a later rollback explainable.
2. **Run the checks.** From `mobile/`: `npm run typecheck`, `npm run lint`, `npm test`,
   `npm run check:build-env`. From `server/` if the change touches the API: `npm run test:unit`.
3. **Confirm the config still says what you think:**
   `npx eas-cli channel:list`, `npx eas-cli env:list --environment <env>`, and
   `npx expo config --type public --json | grep -A3 updates`.
4. **Publish to `preview` first** with `--environment preview --platform android`.
5. **Prove it on a preview install** (§7). If no preview build is installed, see §12 — this is the
   one open gap in the current setup.
6. **Publish to `production`** only after step 5, with `--environment production --platform android`.
7. **Cold-start the production install twice** and look at the screen; confirm the app still reaches
   the API (log in, load the dashboard).
8. **Record it.** Roadmap entry or evidence README with the group id, the message, and what was
   observed. The measured runs in §10 are the template.
9. **If something is wrong:** roll back (or publish a corrected update), then investigate. Both are
   one command and neither needs the store.

For a larger audience, stage the production publish instead of going straight to everyone:

```bash
npx eas-cli update --channel production --environment production --platform android \
  --rollout-percentage 10 --message "Staged release"
# then, once it looks healthy:
npx eas-cli update:republish --group <group-id> --rollout-percentage 100
```

---

## 7. Proving an update actually arrived

Do this once per meaningful release. It takes a minute.

1. Note something **visible** that the update changes: a sentence, a button, a screen, a count.
2. Publish (§5). `npx eas-cli update:list --branch <branch> --limit 3` shows the new group at the top
   with its commit and message.
3. Force-stop and start the app **twice** — the first launch downloads, the second runs it:

```bash
adb shell am force-stop com.inventoryai.app
adb shell monkey -p com.inventoryai.app -c android.intent.category.LAUNCHER 1
```

4. The changed thing is on screen. Then check the thing only a working bundle can do: sign in, or
   load the dashboard — which also proves the bundle was built with the right `EXPO_PUBLIC_API_URL`
   rather than `localhost`. (Symptom if it was not: *"Cannot reach the server"* on every screen.)
5. Optional, decisive on a preview/development build: read the update client's own log. The tag
   observed here is `dev.expo.updates`:

```bash
adb logcat -d | grep dev.expo.updates | tail -20
```

A launch that downloads an update logs `Updates state change: Download` and then
`DownloadCompleteWithUpdate` with `isUpdateAvailable=true, isUpdatePending=true`. A launch with
nothing newer logs `CheckCompleteUnavailable` / `No update available`. After the newest update has
been downloaded, "no update available" on the next launch is **correct** — there is nothing newer to
fetch, and the proof that the downloaded bundle is the running one is the screen itself.

Release builds log far less than this; for those, use the behaviour plus
`npx eas-cli update:insights <group-id>` — launches and unique users per group tell you whether
installs picked it up.

---

## 7A. What the person holding the phone sees

This is the part people ask about first, so it is worth being blunt: **by default, nothing.**

If you change a sentence on the login screen and a heading on Create Account, then publish, the app
on the phone is unchanged for one launch, and after the next launch the words are simply different.
No banner, no toast, no "a new version is available", no restart prompt. `expo-updates` is a
download-and-swap client; it ships no user interface at all. Neither Facebook nor TikTok announce
copy changes either — a silent update is the normal behaviour people already expect from an app.

**What the `--message` is, and is not.** `eas update --message "Fixed the welcome copy"` is stored
with the update group and shown in `eas update:list` and the Expo dashboard. It is a note **to the
team** — for audits, rollbacks and later questions. It never reaches the phone and no user can see it.

**The app currently shows no version anywhere.** There is no Settings row with `1.0.0`, and no code
that reads `Updates.updateId` (verified by searching `mobile/`). So a user cannot tell you which
bundle they are running, and you cannot ask them to check. If supporting real users is the next step,
an *About* line on Profile is the cheapest useful addition — `expo-constants` is already a dependency.

### The three ways to tell people something changed

| Approach | Effort | When it is right |
|---|---|---|
| **Say nothing** | none | Copy tweaks, layout fixes, a corrected word. This is the default and it is usually correct. |
| **A "What's new" card** shown once per update | one screen + ~20 lines | A change people would otherwise hunt for: a moved button, a new field, a renamed tab. |
| **"Restart to apply" prompt** | ~15 lines | Rare — only when someone is waiting on a fix and cannot be asked to relaunch twice. |

**The card, and why it fits this system.** The note lives **inside the new bundle**, so the publish
carries its own announcement and no server or database is involved:

```tsx
import * as React from 'react';
import * as Updates from 'expo-updates';
import * as SecureStore from 'expo-secure-store';

const SEEN = 'inventoryai.updates.seenUpdateId';

export function useWhatsNew() {
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    if (!Updates.isEnabled) return;          // Expo Go, or a build without the client
    if (Updates.isEmbeddedLaunch) return;    // first run: nothing to announce yet
    const id = Updates.updateId;
    if (!id) return;
    SecureStore.getItemAsync(SEEN).then((seen) => setVisible(seen !== id));
  }, []);

  const dismiss = async () => {
    setVisible(false);
    if (Updates.updateId) await SecureStore.setItemAsync(SEEN, Updates.updateId);
  };

  return { visible, dismiss };
}
```

Render it where a **signed-in** person lands first — the dashboard — not on Login. Login and Create
Account are seen by people who are signed out, and a "what changed" card shown before sign-in is
noise at the worst moment.

**The restart prompt, and its catch.** A `downloadComplete` listener only helps if a download happens
*while the app is open*. This project checks at launch (`ON_LOAD`), so by the time a screen is
interactive the download is usually already done, and the event has already fired. A real in-session
prompt therefore has to ask explicitly:

```ts
const check = async () => {
  const result = await Updates.checkForUpdateAsync();   // a network call, on demand
  if (result.isAvailable) {
    await Updates.fetchUpdateAsync();                   // then offer the button
    setReady(true);
  }
};
// the button: await Updates.reloadAsync();
```

Caveats worth knowing before adding it: `reloadAsync()` restarts the JavaScript, so **anything typed
and not saved is lost** — never trigger it automatically while a form is open; and it makes the app
feel like it restarts itself, which some people read as a crash. `ON_LOAD` plus a silent swap is the
calmer default.

### What is not possible

You cannot change the notice's wording from a dashboard or a server without publishing JavaScript.
There is no remote-config channel here: the app's text is the bundle. If the wording had to change
independently of a release, that would be a new backend endpoint serving copy — a backend change, not
an update feature, and not something this project has or needs today.

### What Play Store users see

Nothing different. An OTA publish is invisible to Play Console: no new version, no "What's new"
entry, no review. The Play listing's *What's new* text belongs to a **store release**, so it only
changes when a new AAB is uploaded — which is one more reason a copy change should not need one.

---

## 8. How the app behaves when something goes wrong

| Situation | What actually happens |
|---|---|
| No internet at launch | Starts from the bundle on the device. The check silently fails. Next online launch retries. |
| Download interrupted | The previous bundle keeps running; the download resumes on a later launch. |
| A downloaded update crashes on launch | The client falls back to the embedded bundle, so the app still opens. Publish a fix or roll back. |
| The update is live and wrong | Installed builds keep it until a newer group supersedes it. Publishing a correction is minutes, not a store review. |
| The phone never opens the app | It never updates. There is no push-to-update mechanism — this is not a remote-control channel. |
| The app is reinstalled from the store | It starts on the embedded bundle and picks up the newest update on its next launches. |

---

## 9. Troubleshooting

| Symptom | Likely cause | What to do |
|---|---|---|
| **`404` from the update host for a channel** | No branch/update for that channel, or the runtime version does not match | `eas channel:list`, `eas branch:list`; compare the runtime in the manifest to `expo.version` |
| **"No update available" although `update:list` shows a newer group** | The device's check was cached/refused for a period. On 2026-10-24 a publish was refused for **19+ minutes** while `curl` received the same manifest | Wait, then `eas update:republish --group <id>`; that was served on the very next launch |
| **`Nonexistent flag: --channel`** on `update:list` | This CLI lists by **branch** | `--branch production` |
| **The publish fails building the web bundle** | `--platform android` was omitted | Add it; the project ships no web build |
| **`--environment` required** | SDK 55+ | Add `--environment preview` / `production`; never bypass it |
| **The app says "Cannot reach the server" after an update** | The bundle was built without `EXPO_PUBLIC_API_URL` | `env:list --environment <env>`, fix, republish |
| **`--runtimeVersion is required in non-interactive mode`** | `roll-back-to-embedded` without it | Add `--runtime-version 1.0.0` |
| **Changes appear on one launch, then revert** | The update was published to a channel that install does not listen to, or its runtime differs | Check the build's channel and runtime (`expo config`), then publish to the right one |
| **A dev build never receives updates** | Expected: development builds run Metro | Use a `preview` or `production` build to test OTA |
| **`eas update` says it published, phone unchanged** | The app has only been launched once since | Close and start it again (§7) |

---

## 10. What still needs a new build

| Change | Build? |
|---|---|
| New/upgraded native dependency (`expo-camera`, `@react-native-firebase/*`, …) | **Yes** |
| Adding/removing a config plugin, or changing its options | **Yes** |
| `app.json` native fields: permissions, icon, splash, name, package id | **Yes** |
| Expo SDK upgrade | **Yes** |
| `EXPO_PUBLIC_*` **value** changes | **Yes** |
| Enabling code signing | **Yes** (the certificate is compiled in) |
| Changing `expo.version` | **Yes** — that is the runtime label |
| Screens, components, styles, copy, client validation, API calls to existing or new routes | No — publish |
| Server routes, permissions, mail templates, database rules | No — deploy the server, no app change at all |

Rule of thumb: **`package.json`'s native dependencies or `app.json`'s native fields changed → build.
Only `.ts`/`.tsx` and images changed → publish.**

### The one manual rule

A **native** change must bump `expo.version` (e.g. `1.0.0` → `1.1.0`). Without the bump the new build
keeps runtime `1.0.0` and will happily accept updates compiled for the old native code — the failure
mode is a crash after the bad update is already installed. With the bump, the new build stops
listening to `1.0.0` updates entirely, which is the point.

Because `appVersionSource` is `remote`, EAS owns the Android `versionCode`; the runtime label still
comes from `expo.version` in `app.json`. Check both before a release build:
`npx eas-cli build:version:get --platform android --profile production`.

---

## 11. Security

**What the transport protects.** Updates come over HTTPS from `https://u.expo.dev/<project-id>`. The
project id is public — it is in the bundle already.

**What a bundle may contain.** Only what is compiled into the app today: client code and
`EXPO_PUBLIC_*` values. No database credential, no mail key, no AI provider key can travel this way;
those live on the server and are never in the app. An update **cannot bypass the backend**: sessions,
roles, permissions, tenant isolation and `requireAuth` are enforced on every request, whatever
JavaScript the phone happens to be running. The mobile client is a view; the server is the boundary.

**Who can publish.** Anyone with access to this Expo account/organisation. Treat that account like a
deployment credential: it can change what every installed app runs.

**Code signing is not enabled.** The channels report `Unprotected`. Enabling it means a certificate
compiled into the app and a private key used to sign publishes, so it must be done **before** the store
build, and the build after it ships a different native contract:

```bash
# 1. Generate the key pair and a self-signed certificate (once, offline; keep the private key
#    out of git and out of the app)
cd C:/Users/jeffe/inventory-ai/mobile
npx expo-updates codesigning:generate \
  --key-output-directory ../keys \
  --certificate-output-directory ../keys \
  --certificate-validity-duration-years 10 \
  --certificate-common-name "Inventory AI"

# 2. Write the app-side configuration (updates.codeSigningCertificate and
#    updates.codeSigningMetadata in app.json) and verify it
npx expo-updates codesigning:configure \
  --certificate-input-directory ../keys \
  --key-input-directory ../keys
```

Then **rebuild** — the certificate is compiled into the app — and publish signed updates with the
private key:

```bash
npx eas-cli update --channel production --environment production --platform android \
  --private-key-path ../keys/private-key.pem --message "Signed release"
```

**None of this has been done or exercised in this project.** The commands above are the flags the
installed `expo-updates` CLI actually accepts (checked with `npx expo-updates codesigning:generate
--help`); treat it as a recommendation for the public release, not a description of the current state.

**Staged releases** (`--rollout-percentage`) are the other safety lever: a bad bundle reaches a
fraction of installs rather than all of them.

---

## 12. Current gaps, and what to change

These are the honest gaps between "the feature works" and "the feature is operated well". None of them
is a code defect; most are decisions about how the feature is operated.

1. **No preview build is installed right now.** The handset runs the **production-profile APK**
   (channel `production`, runtime `1.0.0`), because it was used for the release rehearsal. Until a
   `preview` APK is installed, testing an OTA on that phone means publishing to **production** — safe
   only while the sole production install is yours. Recommendation: build one
   `npx eas-cli build --platform android --profile preview` and install it, restoring the
   preview-then-production habit §6 describes. (Costs one build from the monthly allowance.)
2. **Code signing is off.** Turn it on before the public store build, per §11. Doing it later costs a
   store release.
3. **The CLI is a major version behind** (`24.7.0` installed, `25.3.0` available). Not urgent, but
   when you upgrade, re-read `eas update --help`: flags do move.
4. **`EXPO_PUBLIC_API_URL` is declared in two places** (EAS `production` environment and the
   production build profile). Harmless while identical; a trap the day they differ.
5. **Nothing prunes old update groups.** Each publish is small and history is useful, but if the
   list ever becomes noise, `eas update:delete <group-id>` removes one.
6. **The Play path is still unproven.** An OTA to *store* users requires the store build that has
   `expo-updates` inside it — the same mechanism, but it depends on the AAB actually being uploaded
   and installed from Play, which is the open release gate recorded elsewhere. Play App Signing does
   not interfere with EAS Update.
7. **The user is told nothing, and cannot check a version.** There is no "What's new" card, no
   restart prompt and no version row anywhere in the app (§7A). Fine for copy changes; worth one
   small screen before real users arrive, so a support conversation can start with "which build are
   you on?" instead of a guess.

---

## 13. Limits of EAS Update

- **No native changes, ever.** Compiled code, permissions, icons, plugins, SDK version — all need a
  build.
- **No app-store presence.** Store listing, screenshots, content rating, data-safety form, version
  number in Play Console: unchanged by a publish. Play does not see an OTA update as a release.
- **No forced update.** A user who never opens the app keeps the old JavaScript indefinitely.
- **No version rollback of the native app.** You can roll back the JavaScript; you cannot uninstall a
  native change.
- **No change to what the user granted.** A permission prompt cannot appear via OTA.
- **Store policy.** Both stores allow delivering JavaScript that does not change the app's primary
  purpose or bypass review for new features in a disallowed way. This project uses it for fixes and
  shipped UI, which is the ordinary use.
- **A publish is not a proof.** Delivery depends on the install's channel and runtime; the checks in
  §7 are how "published" becomes "running on a phone".
- **iOS is unverified here** (no macOS on this host), even though the mechanism is identical.

---

## 14. Cost

EAS Update is part of the Expo account already used for builds. The Free plan includes updates to
**1,000 monthly active users** and **15 Android / 15 iOS builds per month**, with no per-update
charge. That covers development, testing and early production. Beyond 1,000 monthly active users the
next plan is $19/month — a business decision, not a technical blocker.

---

## 15. Evidence: what has actually been measured on this project

| Claim | Evidence |
|---|---|
| A `preview` APK on the production API updated **without reinstalling**, and the new JavaScript was what ran | [2026-10-24-preview-ota](../evidence/device-runs/2026-10-24-preview-ota/README.md) |
| Preview and production channels are isolated: a production publish was ignored by a preview install across two launches, and production/development manifests answered `404` at that runtime | same record (§ *Channel isolation*) |
| The account journeys worked on that updated build: registration, verification, reset, offline cold start | [2026-10-24-preview-journeys](../evidence/device-runs/2026-10-24-preview-journeys/README.md) |
| A **production-profile release APK** received a published update, and `roll-back-to-embedded` returned it to the embedded bundle | [2026-10-24-release-build](../evidence/device-runs/2026-10-24-release-build/README.md) |
| The **store AAB** carries the right channel, runtime and API host — read out of the artifact, not the log | [2026-10-24-release-aab](../evidence/device-runs/2026-10-24-release-aab/README.md), [2026-10-24-permission-trim](../evidence/device-runs/2026-10-24-permission-trim/README.md) |
| The real production app on the phone was updated by OTA to ship invitations, terms and the deletion fix, and the invitation flow was then walked on it | [2026-10-25-invitations](../evidence/device-runs/2026-10-25-invitations/README.md), [2026-10-25-invitations-admin](../evidence/device-runs/2026-10-25-invitations-admin/README.md) |

**Not verified:** code signing (not enabled), `update:rollback <group-id>` (the *roll-back-to-embedded*
variant is the one that was exercised), the AAB's Play upload path, and iOS.

---

## 16. Cheat sheet

```bash
# where am I, and what is configured?
cd C:/Users/jeffe/inventory-ai/mobile
npx eas-cli channel:list
npx eas-cli branch:list
npx expo config --type public --json | grep -A3 '"updates"'
npx eas-cli env:list --environment production

# check the code first
npm run typecheck && npm run lint && npm test && npm run check:build-env

# publish (preview first, production later)
npx eas-cli update --channel preview    --environment preview    --platform android -m "…"
npx eas-cli update --channel production --environment production --platform android -m "…"

# what did I publish?
npx eas-cli update:list --branch production --limit 5
npx eas-cli update:insights <group-id>

# the phone refuses a publish that exists
npx eas-cli update:republish --group <group-id> -m "Republished"

# something is wrong
npx eas-cli update:rollback <group-id> --platform android -m "Rolled back"
npx eas-cli update:roll-back-to-embedded --channel production --platform android \
  --runtime-version 1.0.0 -m "Back to embedded" --non-interactive

# a native change needs a build, not an update
npx eas-cli build --platform android --profile preview       # APK, adb-installable
npx eas-cli build --platform android --profile production    # AAB for Play
```

**The three sentences to remember.** Saving does nothing; `eas update` publishes; the phone picks it up
on its next launches. JavaScript and images travel this way — native code never does. If you changed
`package.json`'s native dependencies, `app.json`'s native fields, or the SDK, you need a build, and a
native change also needs `expo.version` bumped so old updates cannot reach the new binary.
