# BIMINI studio

A neon-punk desktop front end for the Claude Code you already have on your Mac.
New sessions open as flyers on a wall. The app doesn't replace Claude Code: it runs
your installed `claude` command behind the scenes and shows the conversation in
this design.

## What you need first

1. **Claude Code installed and logged in.** Open Terminal and type `claude`.
   If it starts and knows who you are, you're set. Type `/exit` to leave.
   If it's missing, follow Anthropic's install guide: https://code.claude.com/docs
2. **Node.js.** Install the LTS version from https://nodejs.org.
   To check it worked, run `node --version` in Terminal.
3. **Git.** Run `git --version`. If your Mac offers to install developer tools, say yes.

## Run it (first time)

Copy these into Terminal one line at a time:

```bash
cd ~/Documents
git clone https://github.com/biminibabes/bimini-website.git
cd bimini-website
git checkout claude/desktop-app-interface-6k3yhk
cd desktop-app
npm install
npm start
```

`npm install` downloads Electron, the engine that turns the design into a Mac
window. It took about 300 MB on the Linux test machine; the Mac size may differ.
It only has to do this once.

## Run it (after that)

```bash
cd ~/Documents/bimini-website/desktop-app
npm start
```

## Using it

- **New flyer** (⌘N): pick a folder, then tell Claude what to make.
- **Resume last / continue / wall flyers**: reopen a past session and keep going.
- **House rules** (per flyer):
  - *Ask me first*: anything risky gets stopped. After Claude finishes its turn,
    a pink **CLAUDE NEEDS YOUR OK** box lists what was stopped. **Allow & continue**
    approves exactly those actions and lets Claude carry on.
  - *Let it edit files*: Claude can change files in the folder without asking.
    Running commands still needs your OK.
  - *Plan only*: Claude explains what it would do and changes nothing.
- **Levels**: your 5-hour and weekly usage, filled in after each message.
- **Esc** goes back to the wall.

## Honest limits

- **It's tested on Linux, not on a Mac yet.** Your first run is the real Mac test.
  If something breaks, copy the error from Terminal and send it to Claude.
- **It uses your normal Claude plan.** Everything you do here counts toward the
  same limits as regular Claude Code.
- **Two things rely on details Anthropic doesn't document:** the usage levels and
  the list of past sessions. A Claude Code update could break either one. If that
  happens, the app keeps working and those parts show "?" or come up empty.
- **Approvals happen after Claude's turn, not mid-turn.** Claude may try another
  way around a blocked action before it stops. Read the list before allowing.
- **Keep it personal.** Anthropic's Agent SDK docs say third-party apps can't offer
  claude.ai login unless Anthropic approves it, and can't be called "Claude Code."
  This app never logs in itself; it runs your own Claude Code on your own Mac.
  Check Anthropic's current terms before you share or sell it.
- macOS may ask whether the app can use folders like Documents or Desktop. Say yes
  for folders you want Claude to work in.

## How it's built (for later)

| File | What it does |
| --- | --- |
| `main.js` | Opens the window, the menu, and runs Claude when you send a message |
| `preload.js` | The only functions the window is allowed to call |
| `lib/claude.js` | Finds `claude`, runs it, and reads its live output |
| `lib/sessions.js` | Reads your past sessions from `~/.claude/projects` |
| `app/index.html` | The design |
| `app/renderer.js` | Makes the design work. Opened in a plain browser, it shows example data instead |

Run `npm test` to check the parts that read Claude's output and your session files.

Not done yet: a double-clickable app in your Dock. Right now you start it from
Terminal with `npm start`. Packaging it as a real `.app` is the next step.
