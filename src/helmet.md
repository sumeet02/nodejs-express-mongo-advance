
Helmet is an Express middleware that improves application security by setting various HTTP security headers 
such as Content-Security-Policy, X-Frame-Options, and X-Content-Type-Options, helping protect against attacks like XSS, 
clickjacking, and MIME-type sniffing.

------------------------- NORMAL -----------------------------

Response headers:
   X-Powered-By: Express

This tells hackers:
  "Hey, this server is running Express."


--------------------------With Helmet -----------------------

Response headers become something like:

Content-Security-Policy: ...
X-Frame-Options: SAMEORIGIN
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Cross-Origin-Opener-Policy: same-origin

And X-Powered-By is removed.


------------------------Real-world Examples------------------------

1. Prevent Clickjacking :- 

Imagine your banking website:

<iframe src="https://mybank.com"></iframe>

A malicious site can load your site inside an invisible iframe and trick users into clicking buttons.

Helmet adds:

 X-Frame-Options: SAMEORIGIN

Result: ✅ Browser blocks other sites from embedding your app


______+____________+___________________________________+_______________________

2. Prevent MIME Type Sniffing : -

Suppose you serve: 
    res.setHeader("Content-Type", "text/plain");
    res.send(userFile);

Browser may guess: 
    "Hmm, looks like JavaScript. I'll execute it."

Helmet adds:
    X-Content-Type-Options: nosniff


✅ Browser obeys the content type and doesn't guess.


____________+________________________+___________________________

3. Content Security Policy (CSP)

Suppose you accidentally render:

<script>alert('hacked')</script>

from user input.


Helmet can send:
 Content-Security-Policy:
 script-src 'self'


Now browser says: "Only scripts from this website are allowed."
✅ Many XSS attacks get blocked.

____________+________________________+___________________________

4. Hide Technology Stack : -


Without Helmet:
   X-Powered-By: Express

Attacker knows:
    - Express
    - Potential Express vulnerabilities

Helmet removes it.

____________+________________________+___________________________

5. Referrer-Policy: no-referrer

Meaning:
    User visits https://myapp.com/products/123
    Clicks a link to https://google.com
    Browser sends no Referer header

GET / HTTP/1.1
Host: google.com

No information about your page is leaked.


Without a restrictive policy, browser may send: Referer: https://myapp.com/products/123

Google now knows the exact page the user came from.


Why set false?

Sometimes:
    Analytics tools need the referrer.
    OAuth providers expect referrer information.
    Payment gateways or third-party integrations behave differently without it.


| Setting                                     | Meaning                                                    |
| ------------------------------------------- | ---------------------------------------------------------- |
| `referrerPolicy: false`                     | Don't send the header at all                               |
| `policy: "no-referrer"`                     | Send no referrer information                               |
| `policy: "origin"`                          | Send only domain                                           |
| `policy: "strict-origin-when-cross-origin"` | Send full URL for same-origin, only domain for other sites |
