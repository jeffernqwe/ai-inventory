# 5. Words explained

Jump to the word you need. Where a word has a precise meaning in this project, the entry keeps it.

**adb** — *Android Debug Bridge*: lets a computer command an Android phone over USB. Installing the
app, mirroring, port tunnels all go through it. If `adb devices` does not list the phone, nothing else works.

**APK** — an Android app's installer file. Install with `adb install thefile.apk`, or drag it onto a
mirroring window.

**archive (a product)** — retiring a product without deleting it. Stock records and full history are
kept; the app has no delete button for products and none is planned.

**Atlas** — MongoDB's hosted cloud service, where the database lives. Needs an internet connection,
so "database unreachable" is usually a network problem.

**backend** — the half that holds the rules and talks to the database. The app never talks to the
database directly; that separation is a security rule, not a preference.

**barcode** — the number printed as a product's stripes. A code the app generates — and every code the
seeders write when asked — is a valid **EAN-13** in the GS1 "internal" range (it starts with `2`), with a
real check digit, unique within its business. Scan one with the phone to look its product up
([Guide 9](9-seeding-development.md)).

**bundle** — the app's code packed into one file for the phone. Metro produces it; the Metro window
says when the phone fetched it.

**CI** — *Continuous Integration*: the automated checks that run on every push and refuse a broken change.

**commit** — a saved point in the project's history.

**deep link** — a web-style address (`inventoryai://…`) a phone treats as an instruction to an app.
Used to open the app against a code server, and for the password-reset return.

**dependency** — borrowed code, listed in `package.json` and installed into `node_modules` by `npm install`.

**dev client / development build** — an app build that fetches its code from your laptop at run time.
A finished store build cannot do that; its code is sealed inside.

**EAS** — Expo's cloud build service. Builds happen there, not on the laptop.

**environment** — which copy you point at: **development** (laptop + app), **test** (automated tests
only), **production** (the real deployment). A destructive command needs a third confirmation phrase
before it will touch production ([Guide 12](12-deleting-production.md)).

**endpoint** — a web address on the backend that does one job, such as "log in".

**Expo** — the toolkit the app is built with; `npx expo start` starts the code server.

**Firebase** — Google's sign-in service. It holds email/password and answers "who is this person?".
It holds no business data and decides no permissions.

**firebaseUid / UID** — the hidden identifier Firebase gives an account and the **only** link to its
database record. Never the email address.

**fixture** — a small fixed set of data used by tests. A *seed* is large and meant to look real.

**Git Bash** — a Windows terminal that understands Linux-style commands. Everything in these guides
works in it.

**hot reload** — editing a file and seeing the app update without restarting anything.

**idempotent** — safe to repeat: the second run leaves the same end state, not a duplicate. The
seeders are idempotent.

**inventory movement** — one recorded stock change: in, out, transfer, or correction. Every change
writes one, so history always explains the current quantity.

**JWT** — the temporary pass issued after sign-in and sent with each request. Not your password.

**localhost** — "this computer". On the phone it means *the phone*, which is why the USB tunnel
(`adb reverse`) is required.

**Metro** — the program that packs the app's code and serves it to the phone; started by
`npx expo start`. Its window shows the app's log messages.

**MongoDB** — the database holding business data. In the cloud, reached only by the backend.

**Mongoose** — the library the backend uses to talk to MongoDB.

**Node.js / Node** — runs JavaScript on a computer. The backend needs **version 24**; older versions
cannot start it.

**npm** — installs dependencies and runs the project's commands (`npm start`, `npm test`).

**permission** — one specific thing a role may do. The backend checks it on every request; hiding a
button in the app is convenience, not security.

**port** — a numbered door a program listens on. Backend **4000**, Metro **8081**.
`EADDRINUSE` means the door is taken.

**repo / repository** — the folder holding the project plus its history.

**reverse tunnel** — "when the phone knocks on its own port N, forward it to the laptop". Set by
`adb reverse`; lost whenever the cable is disturbed, which is the most common cause of *"Cannot reach
the server"*.

**role** — what kind of user someone is: **OWNER** (everything; created only by registering a new
business), **ADMIN** (users, products, inventory, audit trail), **MANAGER** (products, inventory,
transfers, suppliers, purchase orders), **STAFF** (stock in/out; view-only products, suppliers,
orders). Checked by the backend, so a role change applies on the next action.

**scrcpy** — *screen copy*: shows the phone in a laptop window and sends mouse/keyboard to it.

**seed (verb)** — fill a database with realistic sample data. **Seed (noun)** — the data, or the
number that makes a generator repeat it.

**session** — the backend's record of a signed-in state. Signing out deletes it, so a copied pass
stops working immediately.

**SKU** — *stock keeping unit*: the business's own reference for a product (`ACCTSKU-0` in seeded data).
Unique within its business when present, and independent of the barcode — a product may have either, both,
or neither.

**stock status** — how a quantity compares with the product's minimum: in stock, low, or out of stock.

**tenant** — one customer's separate world of data. Every record carries its business, every request
is filtered by it, so businesses never see each other's data (*tenant isolation*).

**terminal** — the window where you type commands (PowerShell or Git Bash).

**test** — a small program checking the real code behaves as documented. "Tests pass" means behaviour
is unchanged, not that the code is perfect.

**token** — a temporary pass; see **JWT**.

**tunnel** — see **reverse tunnel**.

**TypeScript** — a stricter JavaScript dialect used for the backend and app. The backend runs it
directly under Node 24, with no build step.

**USB debugging** — an Android setting letting a computer control the phone over the cable. Off by
default; one-time per phone.

**workspace** — the folder containing the project.

**WSL** — *Windows Subsystem for Linux*. **Do not use it for phone work** — it cannot see the USB
device. PowerShell or Git Bash only.

← [Guides index](README.md)
