# Inventory AI — updating the app without reinstalling it

This guide answers one question: **can the app on the phone update itself the way Facebook does,
instead of a new APK being built and installed by hand every time?**

Yes — for changes to the app's own JavaScript and images. Not for changes to native code.
This guide explains which is which, the exact commands, and what was measured on this project.

---

## 1. The short answer

| Kind of change | What it costs you |
|---|---|
| A screen, a sentence, a colour, a form rule, a new API call, a bug fix in `.ts`/`.tsx` | **Over the air.** Publish an update; the phone picks it up on its next launch. No APK, no cable. |
| A new native library, a permission, a config plugin, an Expo SDK upgrade, a change to `app.json`'s native fields | **A new build and one install.** The native half of the app is compiled into the APK and cannot be replaced at runtime. |
| A backend route, a permission, a database change, an email template | **Neither.** These live on the server; deploying the server changes them for every installed app immediately. |

The phone stays installed. Only native changes need the cable again.

---

## 2. How it works, in one paragraph

The app now contains a small update client (`expo-updates`). On launch it asks Expo's update
service, over HTTPS, whether the **preview** channel has a newer JavaScript bundle than the one on
the phone. If it does, it downloads it **in the background** while the app you already have keeps
running, and the new bundle is used **the next time the app starts**. A launch never waits for the
network: `fallbackToCacheTimeout: 0` in `mobile/app.json` means "start now with what is on the
device". With no internet, the app starts exactly as it did before.

Every installed build also carries a copy of the JavaScript it was built with (the "embedded"
bundle), so there is always something to fall back to.

---

## 3. The one-time step that is still needed

An installed APK can only receive updates if it was **built with the update client inside it**.
The preview APK installed on the OPPO on **2026-10-24** is that build (EAS `ea941bb7`), so it is
already updatable and needs no further install for JavaScript changes. An older preview APK — one
built before `expo-updates` was added — cannot receive anything and has to be replaced once.

To build and install it:

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx eas-cli build --platform android --profile preview
```

Then download the APK from the link EAS prints and install it (see
[2. Running Inventory AI on a phone](2-run-on-your-phone.md) for the `adb install` line). This is
also the build that finally carries the update runtime, so it must be the version people keep.

**For the Play Store the same command is run with `--profile production`**, and that profile
produces an **AAB**, not an APK — the default packaging, which is what Google Play requires. An
AAB cannot be installed on a phone with `adb`, so it is released through Play rather than side-loaded;
if you need to install a production build directly for a rehearsal, `android.buildType: "apk"` in
the profile is the temporary switch (see the release-build record), and it must be removed again.
`autoIncrement` is on for that profile, so every production build gets a new `versionCode` — the
AAB built on 2026-10-24 is `versionCode 2`.

Before uploading, check what is inside the artifact rather than trusting the build log:

```bash
cd C:/Users/jeffe/inventory-ai
python docs/evidence/device-runs/2026-10-24-release-aab/verify.py path/to/app-release.aab
```

It reports the package id, version, SDK levels, declared permissions (with any `maxSdkVersion` cap),
signing entries, update channel and runtime version, and greps the bundled JavaScript for the API
host — enough to catch the mistakes worth catching (a production build pointing at `localhost`, one
carrying the wrong channel, or a permission nobody asked for).

If a permission in that list comes from Expo's manifest **template** rather than a dependency —
`SYSTEM_ALERT_WINDOW` does — it is removed with `android.blockedPermissions` in `app.json`, which
Expo applies as `tools:node="remove"` at manifest generation. Check the rebuilt artifact afterwards;
the field alone is not proof.

---

## 4. Shipping a change over the air

From `mobile/`, after the change is committed (EAS records the commit in the update):

```bash
cd C:/Users/jeffe/inventory-ai/mobile
npx eas-cli update --channel preview --environment preview --platform android \
  --message "Say what changed"
```

- `--channel preview` — which installed builds may receive it. This is the switch that matters.
- `--environment preview` — **required**. It loads the preview environment's variables from EAS
  (`EXPO_PUBLIC_API_URL`, the Firebase values). Without it, the bundle would be built with whatever
  is in the laptop's `mobile/.env` — normally `http://localhost:4000`, which is unreachable from a
  phone that is not plugged in. On SDK 55+ the CLI refuses to publish without it; take that refusal
  seriously rather than working around it.
- `--platform android` — **always pass it.** Without it the command also tries to build the
  *web* bundle, which this project does not ship, and the publish fails before uploading anything
  (measured 2026-10-24: `expo-router` → `react-native-web` export error).
- `--message` — the line you will see later in `eas update:list`. Write it for your future self.

The command prints an update ID and a URL. The next time the app is opened (and then closed and
opened again), the phone is on the new JavaScript. Anyone already in the app can also simply
close and reopen it.

**If the phone says "no update" after a publish that EAS reports as successful,** check the phone
again first — and if it still refuses minutes later, republish the same group, which is one command
and served the device immediately in the measured case (§11):

```bash
npx eas-cli update:republish --group <update-group-id> --message "Republished"
```

Useful follow-ups:

```bash
npx eas-cli update:list --channel preview     # what has been published, newest first
npx eas-cli update:insights                   # how many installs picked it up
```

---

## 5. What still needs a build

Anything that changes the compiled app, not just its JavaScript:

| Change | Build? |
|---|---|
| New or upgraded native dependency (`expo-camera`, `@react-native-firebase/*`, …) | **Yes** |
| Adding/removing a config plugin, or changing its options | **Yes** |
| Permissions in `app.json` (camera, notifications, …) | **Yes** |
| App icon, splash screen, app name, package/bundle identifier | **Yes** |
| Expo SDK upgrade (e.g. SDK 58 → 59) | **Yes** |
| Changing `EXPO_PUBLIC_*` values that were compiled in | **Yes** — they are baked into the bundle at build time, and an update built with the same `--environment` inherits the same values; changing the *value* in EAS needs a new build to be sure every install agrees |
| Screens, components, styles, text, client-side validation | No — OTA |
| A call to an existing API route, or a new server route | No — OTA (and the server deploy is separate) |

**Rule of thumb:** if `package.json`'s native dependencies or `app.json`'s native fields change,
build. If only `.ts`/`.tsx` files and images change, publish.

---

## 6. Keeping updates from reaching the wrong binary

Two installs must never receive JavaScript built for a different native app. Two settings enforce
that, and both are pinned by a test ([mobile/\_\_tests\_\_/ota-update-config.test.ts](../../mobile/__tests__/ota-update-config.test.ts)):

1. **`runtimeVersion` = the app version** (`"policy": "appVersion"` in `mobile/app.json`). A build's
   runtime version is its `version` (`1.0.0` today), and an update is served only to builds whose
   runtime version matches exactly. A JavaScript-only change keeps the same version, so it is
   compatible. A native change must **bump `expo.version`** — that is the one manual rule in this
   whole system, and it is deliberate.
2. **One channel per build profile.** `development` → `development`, `preview` → `preview`,
   `production` → `production`. The channel is compiled into the APK and cannot be changed later,
   so a preview update physically cannot reach a production install (or the reverse).

### Why not the automatic "fingerprint" mode?

It was tried first, on 2026-10-24. The build **failed** in the `Configure expo-updates` phase
(build `71d63d16-…`) with:

```text
Runtime version calculated on local machine: e32953a7894593a4e41d1ca76592f3df00d5eeae
Runtime version calculated on EAS:            6217b878d4238c37f68b848c2649d2a2c617181f
```

The cause is our dynamic config: `mobile/app.config.js` reads the Firebase configuration **file
paths** from EAS file environment variables, and those files exist only on the build machine. EAS
therefore hashes a project that the laptop cannot reproduce, and refuses the build before compiling
anything. `appVersion` removes that class of mismatch. The lesson is recorded here so nobody
"improves" it back to `fingerprint` and loses a build queue slot finding out again.

---

## 7. Preview and production are separate by construction

| | `development` | `preview` | `production` |
|---|---|---|---|
| Who installs it | the laptop + a development build | you, testing | the store build |
| API it talks to | `http://localhost:4000` (via `adb reverse`) | `https://ai-inventory-l1mi.onrender.com` | `https://ai-inventory-l1mi.onrender.com` |
| Channel | `development` | `preview` | `production` |
| Update command | `--channel development --environment development` | `--channel preview --environment preview` | `--channel production --environment production` |

Publishing to `preview` cannot touch the production channel's update, and vice versa. That is not a
policy that could be forgotten — the channel is in the binary.

**One thing to check before ever publishing to production.** `eas update` reads its variables from
the EAS environment named by `--environment`, not from `eas.json`'s build profile. On 2026-10-24 the
**production** environment was missing `EXPO_PUBLIC_API_URL` while the preview one had it, and
`mobile/lib/config.ts` falls back to `http://localhost:4000` when that variable is absent — so a
production update published that way would have produced a bundle that could reach no server at
all. The variable has been added to that environment; confirm it is still there before publishing:

```bash
npx eas-cli env:list --environment production | grep EXPO_PUBLIC_API_URL
```

If it is missing, add it (the value is public — it is the same host the app already talks to):

```bash
npx eas-cli env:set --environment production \
  --name EXPO_PUBLIC_API_URL --value https://ai-inventory-l1mi.onrender.com --visibility plaintext
```

A way to see the mistake before a phone does: the published production bundle and the published
preview bundle should contain the same API host. When both environments agree, EAS even deduplicates
the identical bundle to one content key.

A development build runs its JavaScript from Metro instead of from EAS Update, so the `development`
channel exists mainly so the configuration is uniform; day-to-day development still uses fast
refresh, which is faster than any update.

---

## 8. When something goes wrong

| Situation | What happens | What to do |
|---|---|---|
| The phone has no internet at launch | It starts with the bundle already on the device | Nothing; the next online launch picks the update up |
| A download is interrupted | The previous bundle keeps being used; the download is retried on a later launch | Nothing |
| The update downloads but the app crashes on launch | Expo's update client falls back to the embedded bundle, so the app still opens | Roll back (below), fix, publish again |
| The update is live and wrong | Installed builds keep using it until a newer one arrives | Publish a corrected update — usually minutes, not a store review |
| You want the previous version back now | Roll back | `npx eas-cli update:roll-back-to-embedded --channel preview` (back to the bundle built into the APK) or `npx eas-cli update:rollback <group-id> --channel preview` (re-publish an earlier group) |
| You want to test with a small share first | Not enabled by default | Add `--rollout-percentage 10` to the publish command; only 10 % of installs get it until you publish to 100 % |

Rolling back does **not** remove the update from installs that already downloaded it; they move to
the rolled-back version on their next launch, exactly like a normal update.

**The embedded rollback needs `--runtime-version` when run non-interactively.** Without it the CLI
refuses with *"--runtimeVersion is required in non-interactive mode"*:

```bash
npx eas-cli update:roll-back-to-embedded --channel production --platform android \
  --runtime-version 1.0.0 --message "Back to the embedded bundle" --non-interactive
```

This was exercised on a **production-profile release build** on 2026-10-24: a visible marker was
published, the phone ran it, and after the rollback command and two cold launches the phone was back
on the bundle it was installed with. See
[2026-10-24-release-build](../evidence/device-runs/2026-10-24-release-build/README.md).

---

## 9. Security and cost

**Security.** The update is fetched over HTTPS from `https://u.expo.dev/<project-id>`, and the
project ID is public (it is in the bundle already). The bundle contains only what is compiled into
the app today: `EXPO_PUBLIC_*` values and client code. No server secret can travel this way — the
API key for the AI provider, the mail provider and the database stay on the server, as they must.
An over-the-air update **cannot bypass the backend**: roles, permissions, tenant isolation and
`requireAuth` are enforced per request regardless of which JavaScript the phone runs.

Code signing (a signature the app verifies before accepting an update) is available but **not
enabled**. It is worth turning on before a public store release; it needs a key pair whose private
key must be stored safely, so it is deliberately left as a decision for that point.

**Cost.** EAS Update is on the same Expo account already used for builds. The Free plan includes
**updates to 1,000 monthly active users** and 15 Android / 15 iOS builds per month; there is no
per-update charge. At the scale of testing and early production that is free, and it does not add a
new service, a new account or a new bill. If the app ever exceeds 1,000 people receiving updates in
a month, Expo's next plan is $19/month — a business decision, not a technical blocker.

---

## 10. How to prove an update actually arrived

Do this once per major change; it takes a minute.

1. With the current app installed, note something visible the update changes (a sentence, a button,
   a screen).
2. Publish with the command in §4. `eas update:list --channel preview` shows the new group at the top,
   with the commit and the message.
3. Force-stop the app and open it again **twice**: the first launch downloads, the second uses it.
   (`adb shell am force-stop com.inventoryai.app` then
   `adb shell monkey -p com.inventoryai.app 1`.)
4. The changed thing is on screen, and the production API still answers (log in, load the dashboard) —
   which also proves the bundle was built with the preview environment's URL rather than `localhost`.

If step 4 shows "Cannot reach the server", the bundle was published with the wrong
`--environment`. Publish again with the right one; installs move on their next launch.

---

## 11. What is verified, and what is not

**Verified in the repository:**

- `expo-updates` is installed at the SDK-pinned version and listed in Dependabot's ignore list.
- `mobile/app.json` resolves with `runtimeVersion: { policy: "appVersion" }`, the update URL for
  project `607eca05-1175-43ed-86a0-1829e91c9531`, `checkAutomatically: ON_LOAD` and
  `fallbackToCacheTimeout: 0` (`npx expo config --type public --json`).
- Every build profile has its own channel, and preview/production cannot collide (the pinned test).
- The `fingerprint` policy was tried and **failed** in a real build; both hashes are recorded in §6.

**Verified on the phone (2026-10-24).** A `preview` APK talking to the production API was updated
**without reinstalling it**: the publish was downloaded at launch (`DownloadCompleteWithUpdate`),
the next launch ran it, and an offline cold start then stayed signed in — the change the update was
published to deliver, and impossible before it. The same run proved the bundle carried the
production URL, not `localhost`. Evidence, frames and the limits of the run:
[2026-10-24-preview-ota](../evidence/device-runs/2026-10-24-preview-ota/README.md).

**Channel isolation, measured the same day.** With only the `preview` channel existing, a manifest
request for `production` or `development` at the build's runtime version answered **404**. A probe
was then published to the `production` channel — including a visible marker, newer than the bundle
the phone was running — and the phone, across two cold launches, kept its own Login text and logged
**zero** references to the production manifest, while the `preview` manifest kept the same update id
throughout. The production channel and branch were deleted afterwards and the 404 returned.

**The account journeys on that same installed build.** Registration → six-digit verification → new
tenant, then password reset → *Password changed* → old password refused → new password signed in,
then an aeroplane-mode cold start that kept the session — all against the production API, with the
production database checked afterwards and the probe tenant removed. Frames, measurements and the
limits: [2026-10-24-preview-journeys](../evidence/device-runs/2026-10-24-preview-journeys/README.md).

**Verified on a release build (2026-10-24).** The **production profile** — release variant, production
keystore, production channel and environment — was installed over the preview APK and received a
published update; `update:roll-back-to-embedded` then returned it to the embedded bundle on the next
launches. The rehearsal built an **APK** (an AAB cannot be installed with `adb`) and restored the
store packaging afterwards, so it does not prove Play Store packaging or Play App Signing. Frame and
measurements: [2026-10-24-release-build](../evidence/device-runs/2026-10-24-release-build/README.md).

**Verified as an artifact, not on a device (2026-10-24).** The production profile was then built with
its **default store packaging** (EAS `09d77d3d`): a 1,500-entry **AAB**, `com.inventoryai.app`,
`versionName 1.0.0`, `versionCode 2`, `minSdk 24` / `targetSdk 36`, signed with the production
keystore, channel `production`, runtime `1.0.0`, 12 permissions, and a JavaScript bundle containing
the production API host once and `localhost:4000` never. Reproduce it with `verify.py` beside this
record: [2026-10-24-release-aab](../evidence/device-runs/2026-10-24-release-aab/README.md).

A second build (`4b133d62`, `versionCode 3`) removed the unused `SYSTEM_ALERT_WINDOW` permission Expo
adds by default, leaving 11 declarations with byte-identical JavaScript — evidence and the permission
attribution: [2026-10-24-permission-trim](../evidence/device-runs/2026-10-24-permission-trim/README.md).

**Checked with bundletool too (2026-10-24).** Android Studio installs a JetBrains Runtime, so
`bundletool` runs on this host without installing a JDK:

```bash
cd C:/Users/jeffe/inventory-ai
JAVA="/c/Program Files/Android/Android Studio/jbr/bin/java.exe"
"$JAVA" -jar bundletool.jar validate --bundle=app-release.aab
"$JAVA" -jar bundletool.jar dump manifest --bundle=app-release.aab --module=base
```

`validate` exits 0 on the store artifact and the dump prints the authoritative manifest — version
code, SDK levels and the permission list with its `maxSdkVersion` caps. Neither command signs, so no
keystore is needed. (`build-apks` is different: it re-signs the APKs, so it needs a key, and an APK
signed with a different key cannot replace an installed store build.)

**Not yet verified:** the **AAB's upload path** — Play App Signing, the upload-key handover and Play's
own pre-launch checks have never run, and the AAB has never been installed (an AAB cannot be, and
re-signing it locally would break the installed app's signature lineage). iOS (no macOS on this
host), and `update:rollback <group-id>` (re-publishing an earlier group), which remains unexercised.
