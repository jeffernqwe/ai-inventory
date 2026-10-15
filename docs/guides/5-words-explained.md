# 5. Words explained

A short, plain-language glossary. It is **not** meant to be read start to finish — jump to the word
you are stuck on. Where a word has a precise technical meaning elsewhere in the project, the entry
says so rather than simplifying it away.

---

## A–E

**adb** — *Android Debug Bridge*. The tool that lets a computer give instructions to an Android
phone over a USB cable. Everything involving a phone in this project (installing the app, seeing its
screen, forwarding ports) goes through it. If `adb devices` does not list the phone, nothing else
will work.

**APK** — the file format of an Android app, like an installer. You install one with
`adb install thefile.apk` or by dragging it onto a mirroring window.

**Atlas** — MongoDB's hosted cloud service. The database here lives in Atlas, so it is **not** on
your laptop and needs an internet connection. That is why "the database is unreachable" is usually a
network problem.

**backend** — the half of the system that holds the rules and talks to the database. The app talks
to the backend; it never talks to the database directly. That separation is a security rule of the
project, not a preference.

**bundle** — the app's code, packed into one file to send to the phone. Metro produces it. You will
see the word in the Metro window when the phone has fetched it.

**CI** — *Continuous Integration*. An automated robot that runs the checks and tests on every change
and refuses the change if something is broken. It lives on the project's code host, not on your
laptop.

**commit** — a saved point in the project's history. "Committing" records the current changes with
a short explanation.

**deep link** — a special web-style address (here, starting `inventoryai://`) that a phone
understands as an instruction to a particular app. It is how this project opens the app against a
specific code server, and how the password-reset link returns to the app.

**dependency** — a piece of code the project borrows rather than writes. Kept in a list
(`package.json`) and installed into a `node_modules` folder by `npm install`.

**dev client / development build** — a version of the app that fetches its code from your laptop at
run time, so your edits appear immediately. A normal, finished build cannot do this: its code is
sealed inside it. Getting the right kind of build is
[Guide 2, step 4](2-run-on-your-phone.md).

**EAS** — Expo's cloud build service. This project builds the phone app there, in the cloud, rather
than on the laptop.

**environment** — which copy of the system you are pointing at. Here: **development** (your laptop
and the app), **test** (used only by automated tests), **production** (the real thing, in use).
Almost every dangerous command in this project has a check that refuses to run against production.

**endpoint** — a web address on the backend that does one job, such as "log in" or "list products".

**Expo** — the toolkit the phone app is built with. `npx expo start` starts the code server. Expo's
cloud build service is EAS.

---

## F–M

**Firebase** — Google's sign-in service, used here as the **doorkeeper**: it holds email addresses
and passwords and answers "who is this person?" It does **not** hold business data, and it does not
decide what anyone is allowed to do. See [Guide 4](4-test-accounts-and-mock-data.md).

**firebaseUid / UID** — the long hidden identifier Firebase gives each account, and the **only** thing
that links a login to its database record. Never the email address — that is deliberate.

**fixture** — a small, fixed set of sample data an automated test uses. Different from *seed* data,
which is large and meant to look real.

**Git Bash** — a terminal program for Windows that understands the same commands as Linux/macOS. On
this machine, the commands in these guides work in it unchanged. See also **WSL**.

**hot reload** — editing a file and seeing the app update itself without restarting anything. One of
the main reasons for using a dev client and Metro.

**idempotent** — safe to repeat. Running it twice gives the same end state rather than a duplicate
or a mess. The seeding tools here are idempotent by design.

**JWT** — *JSON Web Token*. The temporary pass the backend issues once you sign in, which the app
sends with every request afterwards. It is a short-lived pass, not your password.

**localhost** — "this computer, right here". **The trap in this project:** on the phone,
`localhost` means *the phone*, not the laptop — which is why a port tunnel is required
([Guide 2, step 6](2-run-on-your-phone.md)).

**Metro** — the program that packs the app's code and sends it to the phone. Started by
`npx expo start`. Its window is where the app's log messages appear.

**MongoDB** — the database that holds the business data: products, stock, movements, users, roles.
In the cloud (see **Atlas**), and only ever reached by the backend.

**Mongoose** — the helper library the backend uses to talk to MongoDB in a structured way.

---

## N–S

**Node.js / Node** — the program that runs JavaScript on a computer. This project needs **version 24
or newer** for the backend; older versions cannot start it at all.

**npm** — the tool that installs the project's borrowed code and runs its commands (such as
`npm start` and `npm test`).

**permission** — a specific thing a role is allowed to do, such as "can change inventory". The
backend checks permissions on every request; the app's screens only hide what you cannot do, which
is convenience, not security.

**port** — a numbered door on a computer that a program listens on. The backend uses **4000**;
Metro uses **8081**. Two programs cannot share one port (`EADDRINUSE` means the door is occupied).

**repo / repository** — the folder holding the whole project plus its history.

**reverse tunnel** — a rule meaning "when the phone knocks on its own door *N*, forward that to the
laptop". `adb reverse` sets it up. It is lost every time the cable is replugged, which is the single
most common cause of the app saying *"Cannot reach the server"*.

**role** — what kind of user someone is. The app has four: **OWNER** (everything, including the
business's own settings — an OWNER is created only by registering a new business, never by the
user-management screens), **ADMIN** (manage users, products and inventory, and read the audit
trail), **MANAGER** (products, inventory, stock transfers, suppliers and purchase orders), and
**STAFF** (stock in and stock out, with view-only access to products, suppliers and purchase
orders). Roles live in the database and are checked by the backend on every request, so changing
someone's role takes effect on their very next action.

**scrcpy** — *screen copy*. A free program that shows an Android phone's screen in a laptop window
and sends the mouse and keyboard to the phone. Covered in
[Guide 3](3-see-your-phone-on-your-laptop.md).

**seed (verb)** — fill a database with realistic sample data so the app has something to show.
**Seed (noun)** — the data itself, or the number that makes a random generator produce the same
data every time.

**session** — the backend's record of a signed-in state. Signing out removes the record, so the
pass stops working immediately even if someone kept a copy of it.

**stock status** — how a product's quantity compares with its minimum level: in stock, low on stock,
or out of stock. The dashboard counts all three.

---

## T–Z

**tenant** — one customer's separate world of data. Every record carries the business it belongs to,
and every request is filtered by it, so two businesses on one system never see each other's data.
(It also gives the word *tenant isolation*, meaning exactly that separation.)

**terminal** — the window where you type commands. On Windows this is usually *PowerShell*; *Git
Bash* also works for everything here. To open one: press the Windows key, type `bash` or
`powershell`, and press Enter.

**test** — a small program that checks the real code still behaves as documented. "Tests pass"
means the behaviour is unchanged, not that the code is perfect.

**token** — a temporary pass. See **JWT**.

**tunnel** — see **reverse tunnel**.

**TypeScript** — a stricter dialect of JavaScript, used for the backend and the app. It catches
whole classes of mistakes before the code runs. The backend runs it directly under Node 24, with no
separate build step.

**USB debugging** — an Android setting that lets a computer control the phone over the cable. It is
off by default. Turning it on is [Guide 2, step 2](2-run-on-your-phone.md); it is a one-time setting
per phone.

**workspace** — the folder containing the project.

**WSL** — *Windows Subsystem for Linux*, a way to run Linux on Windows. **Do not use it for the
phone work in these guides** — it cannot see your USB device. PowerShell or Git Bash only.

---

## Two words used about the app itself

**archive (a product)** — retiring a product without deleting it. Archived products keep their stock
records and their full history. Products are never permanently deleted by the app, by design — there
is no delete button, and none is planned.

**inventory movement** — one recorded change to stock: goods in, goods out, a transfer between
locations, or a correction. Every change creates one, so the history can always explain how the
current quantity was reached. This is a firm rule of the project, not a feature.

---

← Back to [the guides index](README.md)
