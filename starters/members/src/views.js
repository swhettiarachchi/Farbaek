// Every page, as HTML strings. Everything a person typed goes through esc(),
// so nobody's note or name can run as code in someone else's browser.
export function esc(value) {
  return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

const date = (iso) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

function layout({ title, user, csrf, body, wide = false }) {
  const nav = user
    ? '<nav class="nav" aria-label="Account">' +
      '<a href="/app">Notes</a>' +
      '<a href="/account">Account</a>' +
      '<form method="post" action="/sign-out"><input type="hidden" name="_csrf" value="' + esc(csrf) + '"><button class="link" type="submit">Sign out</button></form>' +
      "</nav>"
    : '<nav class="nav" aria-label="Account"><a href="/sign-in">Sign in</a><a class="button small" href="/sign-up">Create account</a></nav>';
  return (
    "<!doctype html>" +
    '<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    "<title>" + esc(title) + " | Fieldnote</title>" +
    '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600&display=swap">' +
    '<link rel="stylesheet" href="/styles.css"></head>' +
    '<body><header class="top"><a class="brand" href="/"><span class="mark" aria-hidden="true"></span>Fieldnote</a>' + nav + "</header>" +
    '<main id="main" class="' + (wide ? "wide" : "narrow") + '">' + body + "</main>" +
    '<footer class="foot"><p>Fieldnote is a sample app. Names, notes and accounts here are yours to replace.</p></footer>' +
    "</body></html>"
  );
}

function field({ label, name, type = "text", value = "", autocomplete, hint, required = true, minlength }) {
  return (
    '<label class="field"><span>' + esc(label) + "</span>" +
    '<input name="' + name + '" type="' + type + '" value="' + esc(value) + '"' +
    (autocomplete ? ' autocomplete="' + autocomplete + '"' : "") +
    (required ? " required" : "") +
    (minlength ? ' minlength="' + minlength + '"' : "") +
    ">" +
    (hint ? '<small>' + esc(hint) + "</small>" : "") +
    "</label>"
  );
}

const alert = (message) => (message ? '<p class="alert" role="alert">' + esc(message) + "</p>" : "");
const notice = (message) => (message ? '<p class="notice" role="status">' + esc(message) + "</p>" : "");

export function home() {
  return layout({
    title: "Your notes, kept private",
    wide: true,
    body:
      '<section class="hero">' +
      '<div class="hero-copy"><h1>Your notes, kept private.</h1>' +
      "<p>Write things down and find them again. Only you can read what you write: every note belongs to the account that wrote it.</p>" +
      '<div class="actions"><a class="button" href="/sign-up">Create your account</a><a class="button ghost" href="/sign-in">Sign in</a></div></div>' +
      '<figure class="preview" aria-label="A sample notebook">' +
      '<figcaption>Sample</figcaption>' +
      '<ul><li><strong>Thursday standup</strong><span>Ship the pricing page. Ask Ama about the import.</span></li>' +
      "<li><strong>Book list</strong><span>The Overstory. Piranesi. Klara and the Sun.</span></li>" +
      "<li><strong>Kitchen</strong><span>Measure the window before ordering blinds.</span></li></ul></figure>" +
      "</section>" +
      '<section class="facts" aria-label="How it works">' +
      "<p><strong>Passwords are never stored.</strong> Only a scrypt hash is kept.</p>" +
      "<p><strong>Every form is protected.</strong> A token proves each change came from this site.</p>" +
      "<p><strong>Your account is yours to delete,</strong> with every note in it.</p>" +
      "</section>",
  });
}

export function signUp({ csrf, error, values = {} }) {
  return layout({
    title: "Create your account",
    body:
      '<section class="card"><h1>Create your account</h1>' + alert(error) +
      '<form method="post" action="/sign-up" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      field({ label: "Name", name: "name", value: values.name, autocomplete: "name" }) +
      field({ label: "Email", name: "email", type: "email", value: values.email, autocomplete: "email" }) +
      field({ label: "Password", name: "password", type: "password", autocomplete: "new-password", hint: "At least 12 characters. A phrase is easiest to remember.", minlength: 12 }) +
      '<button class="button" type="submit">Create account</button></form>' +
      '<p class="muted">Have an account? <a href="/sign-in">Sign in</a>.</p></section>',
  });
}

export function signIn({ csrf, error, message, values = {} }) {
  return layout({
    title: "Sign in",
    body:
      '<section class="card"><h1>Sign in</h1>' + alert(error) + notice(message) +
      '<form method="post" action="/sign-in" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      field({ label: "Email", name: "email", type: "email", value: values.email, autocomplete: "email" }) +
      field({ label: "Password", name: "password", type: "password", autocomplete: "current-password" }) +
      '<button class="button" type="submit">Sign in</button></form>' +
      '<p class="muted"><a href="/reset">Forgot your password?</a> New here? <a href="/sign-up">Create an account</a>.</p></section>',
  });
}

export function resetRequest({ csrf, error, sent }) {
  return layout({
    title: "Reset your password",
    body:
      '<section class="card"><h1>Reset your password</h1>' + alert(error) +
      (sent
        ? notice("If that email has an account, a reset link is on its way. It works once, for 30 minutes.") +
          '<p class="muted">This sample app has no email service yet, so the link is written to the server\'s log. Connect one in src/app.js (sendResetLink).</p>'
        : '<form method="post" action="/reset" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
          field({ label: "Email", name: "email", type: "email", autocomplete: "email" }) +
          '<button class="button" type="submit">Send a reset link</button></form>') +
      "</section>",
  });
}

export function resetForm({ csrf, token, error }) {
  return layout({
    title: "Choose a new password",
    body:
      '<section class="card"><h1>Choose a new password</h1>' + alert(error) +
      '<form method="post" action="/reset/' + esc(token) + '" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", hint: "At least 12 characters.", minlength: 12 }) +
      '<button class="button" type="submit">Save and sign in</button></form></section>',
  });
}

export function notes({ user, csrf, list, error }) {
  const items = list.length
    ? '<ul class="notes">' +
      list
        .map(
          (n) =>
            '<li><p>' + esc(n.text) + "</p>" +
            '<div class="row"><time datetime="' + esc(n.createdAt) + '">' + esc(date(n.createdAt)) + "</time>" +
            '<form method="post" action="/app/notes/' + esc(n.id) + '/delete"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
            '<button class="link danger" type="submit" aria-label="Delete this note">Delete</button></form></div></li>',
        )
        .join("") +
      "</ul>"
    : '<p class="empty">No notes yet. Write the first one above: only you will see it.</p>';
  return layout({
    title: "Your notes",
    user,
    csrf,
    body:
      "<h1>Your notes</h1>" + '<p class="muted">Signed in as ' + esc(user.email) + ". Nobody else can read these.</p>" + alert(error) +
      '<form method="post" action="/app/notes" class="compose"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      '<label class="field"><span>New note</span><textarea name="text" rows="3" maxlength="2000" required></textarea></label>' +
      '<button class="button" type="submit">Save note</button></form>' + items,
  });
}

export function account({ user, csrf, error, message }) {
  return layout({
    title: "Account",
    user,
    csrf,
    body:
      "<h1>Account</h1>" + alert(error) + notice(message) +
      '<section class="card flat"><h2>' + esc(user.name) + "</h2><p class=\"muted\">" + esc(user.email) + ". Member since " + esc(date(user.createdAt)) + ".</p></section>" +
      '<section class="card flat"><h2>Change your password</h2>' +
      '<form method="post" action="/account/password" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      field({ label: "Current password", name: "current", type: "password", autocomplete: "current-password" }) +
      field({ label: "New password", name: "password", type: "password", autocomplete: "new-password", hint: "At least 12 characters. Every other device is signed out.", minlength: 12 }) +
      '<button class="button" type="submit">Change password</button></form></section>' +
      '<section class="card flat danger-zone"><h2>Delete your account</h2><p class="muted">Your account and every note in it are deleted. This can\'t be undone.</p>' +
      '<form method="post" action="/account/delete" class="stack"><input type="hidden" name="_csrf" value="' + esc(csrf) + '">' +
      field({ label: "Password", name: "password", type: "password", autocomplete: "current-password" }) +
      '<button class="button danger" type="submit">Delete my account</button></form></section>',
  });
}

export function notFound(user, csrf) {
  return layout({ title: "Not found", user, csrf, body: '<section class="card"><h1>This page isn\'t here</h1><p class="muted"><a href="/">Go to the start</a>.</p></section>' });
}

export function refused(message) {
  return layout({ title: "Refused", body: '<section class="card"><h1>That didn\'t go through</h1>' + alert(message) + '<p class="muted"><a href="/">Go to the start</a>.</p></section>' });
}
