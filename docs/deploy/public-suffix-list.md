# Adding farbaek.si to the Public Suffix List

Published sites live at `name.farbaek.si`, and previews at `p-<id>.farbaek.si`. Browsers treat all of them as one site until `farbaek.si` is on this list, so one person's page could set a cookie that reaches another's, and "same-site" protections don't separate them. Farbaek's own cookies aren't affected, because the app lives on `farbaek.com`.

Only the domain's owner can do this. It costs nothing. Once merged, browsers pick it up over several months as they update.

## Before you start

- Open github.com/publicsuffix/list and read its guidelines as they stand today. They ask, among other things, for the domain's registration to have more than two years left. Renew `farbaek.si` first if it doesn't.

## Steps

1. **Open a pull request** on github.com/publicsuffix/list. Edit `public_suffix_list.dat` and add this at its alphabetical place in the `PRIVATE DOMAINS` section, by company name, with your own name and email:

   ```
   // Farbaek : https://www.farbaek.com
   // Submitted by Your Name <you@example.com>
   farbaek.si
   ```

   In the description, say:

   > Farbaek publishes customers' websites as subdomains of farbaek.si. Each one is run by a different customer, so they need to be separate sites to browsers, for cookies and for storage.

2. **Add one DNS record for `farbaek.si`,** which proves you own it:

   | Type | Name | Value |
   | --- | --- | --- |
   | TXT | `_psl` | `https://github.com/publicsuffix/list/pull/<your pull request's number>` |

3. **Leave the record in place** for as long as the entry is on the list.

## After it's merged

Nothing changes in the code. Check it landed by searching for `farbaek.si` on publicsuffix.org/list/public_suffix_list.dat.
