==============================================================
  VELOURA FASHION STORE - setup in 5 steps (no npm, no Node.js)
==============================================================
Plain HTML + CSS + JavaScript. Data, logins and images live in YOUR Supabase project.

STEP 1  Extract the ZIP (right-click > Extract All). Do not run it from inside the ZIP.

STEP 2  Open  supabase/supabase.js  in Notepad and replace the two values:
            const SUPABASE_URL      = 'https://YOUR-PROJECT.supabase.co';
            const SUPABASE_ANON_KEY = 'sb_publishable_...';
        Find them in Supabase > Project Settings > API ("Project URL" and the "Publishable" / "anon public" key).
        Use ONLY those. NEVER use the service_role or secret key (the site refuses them).
        This is the only place credentials are entered. The whole website shares the one client created there.

STEP 3  Supabase > SQL Editor > New query. Open  database/setup.sql  , copy ALL of it, paste, press RUN. Once.
        (Safe to run again later: it never deletes your data.)

STEP 4  Supabase > Authentication > URL Configuration:
            Site URL ........... http://localhost:8090
            Redirect URLs ...... http://localhost:8090/**
        (needed so the e-mail confirmation / password-reset links come back to your site.)
        For quick testing you may turn OFF  Authentication > Sign In / Providers > Email > "Confirm email".
        Leave it ON for a real store: checkout requires a verified e-mail.

STEP 5  Double-click  START_WEBSITE.bat  -> your browser opens http://localhost:8090
        Register an account and use the site.
        Mac/Linux: run START_WEBSITE_MAC_LINUX.command (needs Python 3).

--------------------------------------------------------------
FIRST ADMIN (one trusted step - there is no admin sign-up)
--------------------------------------------------------------
Nobody can become admin by registering, editing the browser, or changing form data. Roles live in a
protected database table that browsers cannot write. To create YOUR admin:
  1. Register on the website with the email you want as admin and confirm the email.
  2. Supabase > SQL Editor: open  database/make_admin.sql , replace owner@yourdomain.com with that email, RUN.
     (It refuses unless the account exists, the email is confirmed and the account is active.)
  3. Log out and log in on the website. The Account page now shows "Admin dashboard".
Until you do this there is NO admin account and the admin dashboard will say "Admins only".

SELLERS: "Register as a Seller" creates a PENDING application. The seller cannot list products until an
admin approves it (Admin > Sellers > Approve). New products also need admin approval (Admin > Products),
unless you set auto_approve_products = true in Admin > Settings.

--------------------------------------------------------------
TEST CHECKLIST (do this once)
--------------------------------------------------------------
  [ ] Register a buyer, confirm email, log in.      [ ] Create your admin (above).
  [ ] Register a seller account -> status "pending". [ ] Admin > Sellers > Approve (seller logs out/in).
  [ ] Seller: Add product (category, prices, an image, a size/color variant with stock) > Submit for review.
  [ ] Admin > Products > Approve.  Product now shows on Home / category / search.
  [ ] Buyer: pick size, Add to bag, Checkout, add address, Place order (Cash on Delivery).
  [ ] Seller: Orders > confirm > processing > packed > shipped (courier + tracking). Buyer sees the timeline.
  [ ] Seller marks delivered -> buyer can write a review / request a return.

--------------------------------------------------------------
WHAT WORKS / WHAT NEEDS EXTRA ACCOUNTS
--------------------------------------------------------------
WORKS (real Supabase operations, no mock data):
  Buyers  : register/login/verify e-mail/forgot password, browse, search + filters + sorting, product pages
            (sizes, colors, stock, size guide, PIN check), wishlist, bag (guest bag merges on login), coupons,
            saved addresses, Cash-on-Delivery checkout, order history + tracking timeline, cancel before shipping,
            returns, verified-purchase reviews, notifications.
  Sellers : application + approval gate, products with multiple images (Supabase Storage), variants, inventory,
            orders with ship-to details + courier/tracking, sales stats, store profile.
  Admin   : sellers, buyers, product moderation, orders (status/cancel+restock), returns, refund records,
            categories, brands, coupons, banners (schedule + countdown), home sections, delivery PINs, reviews,
            reports, store settings (brand name, tagline, contact, shipping, COD), audit log.
NEEDS EXTRA SETUP (shown as "not enabled", never faked):
  * ONLINE PAYMENT (UPI/cards): added in v4 (Razorpay). Needs the one-time setup in the section "UPDATE v4" below.
  * Automatic refunds: refunds are RECORDED; you pay the customer yourself, then press "Mark paid".
  * Delivery PIN checker only knows PIN codes you add (Admin > Delivery PINs). Empty list = "confirmed at checkout".
  * Payment records table exists in the database; there is no payments screen in this package.
  * Internet is required (Supabase library loads from cdn.jsdelivr.net, and Supabase itself is online).



==============================================================
  UPDATE v3: ICONS, SPEED CACHE, OFFLINE MODE  (no database changes)
==============================================================
NO SQL TO RUN. Your database is unchanged. Do NOT re-run setup.sql for this update.

HOW TO UPDATE SAFELY (Windows)
  1. Close the black START_WEBSITE window if it is open.
  2. Keep a copy of your old folder (just rename it, e.g. veloura-old).
  3. Extract this ZIP to a new folder.
  4. Copy YOUR OLD  supabase\supabase.js  over the new one  (it holds your URL + key).   <- IMPORTANT
     (The new supabase.js has one extra line that routes the single client through the cache layer; if you paste your two values
      into the NEW file instead, that works too.)
  5. Double-click START_WEBSITE.bat. It uses port 8090 now. (If you ever must change the port, change PORT in the .bat
     and add that address in Supabase > Authentication > URL Configuration.)
  6. In the browser press Ctrl+Shift+R once (hard refresh) so the new service worker takes over.

WHAT IS NEW
  * Icons: every emoji used as an interface control was replaced by one consistent inline-SVG icon set (assets/js/icons.js, 52 icons,
    no library, no build). Icon-only buttons always carry an aria-label + tooltip. Visible keyboard focus everywhere.
  * Look and feel: smoother buttons/inputs, toasts with icons, animated account menu, heart "pop", quantity bump, skeletons, spinners on
    busy buttons, hover lift on product cards only on devices with a mouse, full reduced-motion support. Product cards keep the
    uniform 3:4 box with the whole product visible (object-fit: contain), lazy images and a placeholder if an image fails.
  * Speed: ONE data layer (assets/js/cache.js). Public catalogue data (categories, brands, banners, home sections, product lists,
    product pages, public settings/branding) is kept in IndexedDB. Pages show saved data instantly, then refresh quietly in the
    background; if something changed the page redraws in place (no full reload). Identical simultaneous requests are merged into one.
    Freshness: categories/brands 30 min, product lists 2 min, product pages 5 min, settings/home 5 min (see CACHE_POLICY in cache.js) +
    refresh when you return to the tab and every 3 minutes while it is open. Any product/category/banner/branding change made by an
    admin or seller (or an order that changes stock) marks the caches stale immediately and refreshes the page you are on; other open tabs
    are told too. Cache version "2" - bumping CACHE_VER wipes old caches automatically after a schema change.
  * Offline: a service worker (sw.js) saves the app files (HTML/CSS/JS/icons + the Supabase library) and public product images, so the
    site opens without internet and shows what you already viewed. A bar says "You are offline ... prices and stock may be outdated"
    with a Retry button. Pages never viewed before show "Not available offline" - nothing is invented.
    Offline you can still: browse saved pages, change the wishlist, change the bag. Signed-in changes wait in a local queue and sync when
    you are back (status shown); guest bag/wishlist are simply saved on the device. Each queued change is re-checked by the server when it
    syncs; changes the server rejects (e.g. product removed) are reported and dropped.
    Offline you CANNOT: log in, register, check out, pay, place or cancel orders, see order status. Checkout is blocked with a clear message.
    An order is never shown as placed/paid unless the server confirmed it. Prices/stock/totals are ALWAYS recalculated by the database
    when you order; cached numbers are never used for an order.
  * Privacy: nothing private (orders, addresses, profile, roles, tokens) is cached. Admin/seller rights are re-read from the database each
    time and never from a cache. On log out the small bag/wishlist mirrors are deleted; the public product cache is kept on purpose.
    Supabase keeps its own sign-in session as before.
  * Server: new server.py (used by START_WEBSITE.bat when Python exists) sends correct types for .js/.css/.svg/.json and
    "Service-Worker-Allowed". Reason: on some Windows PCs plain "python -m http.server" labels .js as text/plain and browsers then refuse
    to register a service worker. server.ps1 (PowerShell fallback) now also sends correct headers.

HOW TO TEST OFFLINE MODE (Chrome / Edge)
  1. Open http://localhost:8090 , press F12 > Application tab > Service Workers: you should see sw.js "activated and is running".
  2. Browse: Home, a category, 2-3 products (this saves them).
  3. F12 > Network tab > tick "Offline" (or Application > Service Workers > Offline).
  4. Press F5. The site still opens, the offline bar appears, saved pages/products/images show. Open a product you never viewed:
     you get "Not available offline". Add to wishlist: "Saved on this device...". Try Checkout: blocked.
  5. Untick "Offline". The bar says "Back online", queued changes sync, pages refresh.
  Tip: Application > Storage > "Clear site data" resets everything (cache, service worker, IndexedDB) if you want a clean test.

PRODUCT UPDATE TEST: open the site in two tabs. In tab A (admin) edit a product price and save. Tab B updates within seconds (cross-tab
  signal) or within 3 minutes / on returning to the tab, without a reload. Changes made by someone on ANOTHER computer appear on the next
  background check (<= 3 minutes, when the tab is visible) - there is no live push (Supabase Realtime is not enabled in this project).

FILES CHANGED / NEW IN v3
  NEW: assets/js/icons.js, assets/js/cache.js, sw.js, server.py
  CHANGED: index.html, supabase/supabase.js (+fetch wrapper), assets/js/core.js app.js shop.js account.js seller.js admin.js,
           assets/css/styles.css, START_WEBSITE.bat, server.ps1, START_WEBSITE_MAC_LINUX.command, README.txt.   database/: unchanged.

TEST REPORT FOR v3 (honest)
  RAN AND PASSED (Node, simulated browser APIs): 24 checks of the cache layer/queue (instant cache, one background refresh, de-duplication,
    change detection, offline keeps cache, uncached+offline -> clear error and no network call, version wipe, per-user queue,
    last-write-wins, sync replay, network error keeps changes, rejected changes dropped, logout clears mirrors, writes trigger refresh);
    18 checks of the service worker logic with a mocked Cache API (install/activate/cleanup, offline shell fallback, Supabase REST/auth/POST never
    intercepted, SQL files not cached, public images cached, private storage URLs not cached); 16 branding checks (earlier);
    all JS files load; all 52 icons render and all 27 icon names used exist; zero emoji left; no icon-only control without aria-label;
    server.py returned correct Content-Type for sw.js/js/css/svg/html/sql and the Service-Worker-Allowed header (tested over HTTP).
  NOT RUN (no browser, no Supabase, no Windows here): service-worker registration in a real browser, real IndexedDB, real offline mode,
    START_WEBSITE.bat / server.ps1 on Windows, visual layout at phone/tablet/desktop widths, login/registration/cart/checkout/seller/admin
    regression against a live database, timing measurements. Do the Chrome DevTools test above and report anything odd; I will not call
    these "passed" until you have seen them pass.
  KNOWN LIMITS: service workers need http://localhost or https (not file://); the Supabase library loads from a CDN, so the very FIRST visit
    needs internet (after that it is saved); images you never viewed are not available offline; the cache stores public data only, so
    a signed-in user's orders/addresses are never available offline; no push updates (polling every 3 minutes while the tab is visible).

--------------------------------------------------------------
NEW: WEBSITE APPEARANCE & BRANDING (Admin > Appearance)
--------------------------------------------------------------
Log in as admin > Admin dashboard > "Appearance". You can change, with a live preview:
  * Primary / Secondary / Accent color (color picker + hex box + Reset each)
  * Website display name and tagline
  * Main logo, optional footer logo, browser favicon (PNG/JPEG/WebP; favicon also .ico). SVG is NOT allowed (unsafe).
Nothing goes live until you press "Save Changes". "Cancel changes" discards the draft. "Reset to Default" only resets the
preview until you Save. Colors apply everywhere through CSS variables (header bar, buttons, links, badges, footer ...).

DATABASE: fresh install = nothing extra (it is at the end of database/setup.sql).
  Already ran an OLDER setup.sql? Open Supabase > SQL Editor > New query > paste database/migration_branding.sql > Run (once; safe to repeat).
  It adds: a 'branding' row in store_settings, the admin-only function admin_save_branding(), and allows .ico in the
  existing PUBLIC storage bucket "brand-assets" (files go to the folder branding/). No existing data is changed.
  Nothing to click in the Storage dashboard: the bucket and its admin-only write policy already exist from setup.sql.
Security: only admins can save (checked inside Postgres by is_admin(); RLS on store_settings is admin-write; the storage policy is
  admin-write). Values are validated in SQL (hex colors, name length, file path pattern) and AGAIN in the browser before use.
  Uploaded files are checked by size and by real file signature (not just the extension).

NEW STORE LOOK (Meesho-inspired, own identity): header with search + wishlist + account menu + bag, category bar built from
  your real categories (Admin > Categories), uniform product cards (3:4 image box, full product visible - no stretching or cropping,
  neutral background, placeholder if an image fails), 2 columns on mobile, 3-4 on tablet, 4-5 on desktop.
  Fresh installs also get starter categories Women, Men, Kids, Western Wear, Jewellery, Home & Living (edit/delete in Admin).
  Old installs: add those categories yourself in Admin > Categories if you want them. Ratings, discounts and stock shown on cards come
  only from real database data.

FILES CHANGED IN THIS UPDATE
  assets/css/styles.css  (theme variables, uniform cards, header/footer)   assets/js/core.js  (branding/theme module, settings load)
  assets/js/app.js  (header, category bar, account menu, footer)           assets/js/shop.js  (product card, image fallback)
  assets/js/admin.js  (Appearance page)   index.html  (favicon link id)   database/setup.sql  (+ branding, categories)
  database/migration_branding.sql  (NEW)   README.txt

TESTS RUN FOR THIS UPDATE (honest report)
  PASSED (automated, Node): 16 checks of the branding module - defaults, hex validation, CSS-injection and path-traversal rejection,
  SVG/external-URL logo paths rejected, text-contrast color choice, CSS variables applied, document title, versioned favicon URL,
  cache saved, name escaped against HTML injection. Also: all JS files load; every table/function the code uses exists in setup.sql;
  every policy/trigger is drop-then-create; no secret key in browser code; one Supabase client.
  NOT RUN (no browser / no database here): visual grid check at desktop/tablet/mobile widths, uploading a real logo/favicon, favicon after
  refresh, colors persisting after refresh, a non-admin trying to write settings directly (expected to be blocked by RLS and by
  is_admin()), login/cart/checkout/orders regression, START_WEBSITE.bat run, browser console check. Please run them once; I will not
  claim they pass until you have seen them pass.

--------------------------------------------------------------
SECURITY (enforced in the database, not the browser)
--------------------------------------------------------------
  * Row Level Security is ON for every table; table rights are revoked, then granted minimally.
  * Buyers see only their own orders/addresses/cart. Sellers only their own products and order lines (seller_orders()
    returns ship-to details but no email/user id). Sellers cannot approve their own products or change others'.
  * Checkout (place_order_cod) acts only for the logged-in user; prices, totals, stock, coupons, shipping and tax are
    computed inside the database under row locks; an idempotency key prevents duplicate orders; client-supplied
    prices/payment status are never read. Payment/refund/status tables have no browser write access.
  * Storage: product images are public-read; only an APPROVED seller can upload, only into their own folder
    (<user-id>/...); JPG/PNG/WebP up to 5 MB. seller-documents bucket is private. Category/brand/banner images are admin-only.
  * Only the Project URL and publishable key are in the browser. No service_role/secret key anywhere.
  * localStorage holds only guest bag, guest wishlist, recently viewed and recent searches. Never passwords or roles.

--------------------------------------------------------------
TROUBLESHOOTING (the site shows a clear message for each)
--------------------------------------------------------------
  "Missing Supabase Project URL / API key", "Invalid ... URL"   -> edit supabase/supabase.js, save, refresh.
  "Supabase library not loaded"                                 -> check internet.
  "database tables are missing"                                 -> run database/setup.sql (Step 3).
  "Supabase rejected the API key"                               -> wrong key or key from another project.
  Port 8090 busy                                                -> close the other program or edit PORT in START_WEBSITE.bat
                                                                   (then also change the URLs in Step 4).
  "email rate limit exceeded" / too many attempts on Register -> Supabase free email = only ~2-4 emails per HOUR (every Register and
                                                                   every 'Resend' counts, even failed ones). Turn OFF 'Confirm email' (Step 4), wait 1 hour, or add SMTP.
  E-mails not arriving                                          -> Supabase's built-in sender is rate-limited; see Step 4 note or add SMTP.
  Opening index.html by double-click (file://) is NOT supported: sign-in links and sessions need http://localhost.

FILES
  index.html                    the website
  supabase/supabase.js          THE ONLY place for your URL + key; creates the single client (window.sb)
  database/setup.sql            the ONE database setup file
  database/make_admin.sql       optional first-admin bootstrap (trusted, manual)
  assets/css, assets/js, assets/img   styles, application code, images
  START_WEBSITE.bat, server.ps1, START_WEBSITE_MAC_LINUX.command   launchers

HONEST STATUS / LIMITATIONS
  This package was assembled in an environment with no internet, no browser and no Postgres, so:
  - setup.sql has NOT been executed against a real Supabase/Postgres database.
  - The app has NOT been clicked through in a browser against a live project.
  What WAS checked: JavaScript syntax and script loading under Node; supabase.js credential validation (placeholders,
  bad URL, secret/service_role keys, missing library); every table, view, RPC and storage bucket the JavaScript
  uses exists in setup.sql and every browser-callable RPC is granted; every policy/trigger is drop-then-create;
  exactly one createClient() exists in the project.
  Please run the test checklist once and report any error text you see (the site and the SQL editor show it).
  Automated tests (pgTAP for permissions) are in the earlier developer ZIP, not here.



==============================================================
  UPDATE v4: ONLINE PAYMENT WITH RAZORPAY  (UPI / cards / netbanking)
==============================================================
HOW IT WORKS
  Checkout now has "Pay online" and "Cash on Delivery". For online payment: the server creates the order (price, stock, coupon and
  total are recalculated by the database, never taken from the browser) -> Razorpay payment window opens -> after payment the server
  verifies Razorpay's signature, asks Razorpay if the money really arrived and marks the order PAID/confirmed. A Razorpay webhook
  confirms it again even if the buyer closes the browser. Unpaid orders are cancelled automatically after 30 minutes (stock returns);
  the buyer can press "Pay now" on the order page to try again.
  Your Razorpay SECRET key lives ONLY in Supabase "Secrets". It is never written in any website file.

ONE-TIME SETUP (about 15 minutes, no terminal needed)
  1. Razorpay Dashboard (stay in TEST mode first) > Account & Settings > API Keys > Generate Key. You get Key Id (rzp_test_...) and
     Key Secret. Do not share the secret with anyone and do not paste it into any file of this website.
  2. Supabase > SQL Editor > New query > open database/migration_razorpay.sql , copy all, RUN once.
     (It switches "online_payments_enabled" ON and schedules the 10-minute clean-up of unpaid orders. If it prints a pg_cron notice:
      Supabase > Database > Extensions > enable pg_cron, then run the file again.)
  3. Supabase > Edge Functions > Secrets (or Project Settings > Edge Functions > Secrets). Add 3 secrets:
        RAZORPAY_KEY_ID          = rzp_test_xxxxxxxx
        RAZORPAY_KEY_SECRET      = (your key secret)
        RAZORPAY_WEBHOOK_SECRET  = any long random text you invent (e.g. 30 random letters/numbers). Remember it for step 5.
  4. Supabase > Edge Functions > Deploy a new function > "Via Editor". Do this THREE times. The name must be exactly:
        payment-init        <- paste the code of  supabase/functions/payment-init/index.ts
        payment-verify      <- paste the code of  supabase/functions/payment-verify/index.ts
        razorpay-webhook    <- paste the code of  supabase/functions/razorpay-webhook/index.ts
     After deploying EACH function open its Settings and switch "Verify JWT" OFF (the code checks the user itself) and save.
     (CLI users: supabase functions deploy payment-init payment-verify razorpay-webhook   - supabase/config.toml already sets this.)
  5. Razorpay Dashboard > Account & Settings > Webhooks > Add new webhook:
        URL     : https://YOUR-PROJECT.supabase.co/functions/v1/razorpay-webhook
        Secret  : the same RAZORPAY_WEBHOOK_SECRET text from step 3
        Events  : payment.captured , payment.failed , order.paid
  6. Update the website files (see "HOW TO UPDATE" in v3 above: keep your old supabase\supabase.js), start the site, press Ctrl+Shift+R.

TEST (Razorpay TEST mode, no real money)
  Buyer: add product to bag > Checkout > choose "Pay online" > "Pay securely". In the Razorpay window use the test card
  4111 1111 1111 1111 , any future expiry, any CVV, and any OTP (or the Razorpay test UPI id success@razorpay).
  Expected: "Thank you! Order placed - Payment received". Order status "Confirmed", payment "paid"; the seller now sees the order as
  Prepaid. Close the window without paying: you land on the order page with a "Pay now" button and payment "pending".
  Payment failed test: UPI id failure@razorpay.

GO LIVE
  Complete Razorpay KYC/activation, generate LIVE keys (rzp_live_...), replace RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in Supabase
  Secrets, create the webhook again in LIVE mode, and host the website on a real https:// domain (add that domain in Supabase >
  Authentication > URL Configuration). Test mode and live mode keys/webhooks are separate.

REFUNDS: still manual. Refund the customer in Razorpay Dashboard > Payments > Refund, then press "Mark paid" in Admin > Refunds.

TROUBLESHOOTING
  "Online payment server function is not deployed yet"  -> step 4 (names must match exactly).
  "Online payment is not set up on the server yet"      -> step 3 (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET missing).
  "Pay online" is greyed out                            -> step 2 not run, or Admin > Settings > online_payments_enabled is false.
                                                           (Settings are cached up to 5 minutes; press Ctrl+Shift+R.)
  Function returns 401 / "AUTH_REQUIRED"                -> log out and in again; make sure "Verify JWT" is OFF for all 3 functions.
  Paid but order stays "pending"                        -> check step 5 webhook; open the order and press "Pay now" (it re-checks).
  Supabase > Edge Functions > (function) > Logs shows the exact server error.

FILES CHANGED / NEW IN v4
  NEW: supabase/functions/payment-init, payment-verify, razorpay-webhook, supabase/config.toml, assets/js/payments.js, database/migration_razorpay.sql
  CHANGED: assets/js/shop.js (checkout), account.js (order page, Pay now), seller.js (Prepaid label), core.js (messages), cache.js,
           admin.js (notes), index.html, sw.js (v4), README.txt.   Existing setup.sql: unchanged.
TESTED HERE: browser payment flow with a simulated Razorpay window (paid / window closed / verify failed), signature maths, JS and
  TypeScript syntax. NOT TESTED HERE: calls to real Razorpay and your Supabase (no internet/keys in my sandbox) - do the TEST above once.



==============================================================
  UPDATE v5: MEESHO / FLIPKART STYLE STOREFRONT + COUPON FIX
==============================================================
1) RUN THIS SQL ONCE: Supabase > SQL Editor > paste database/migration_v5.sql > Run.
   It fixes "coupon code required" (orders now work WITHOUT a coupon) and creates the Storefront settings.
2) Copy the new files over your website folder (keep your own supabase\supabase.js), start the site, press Ctrl+Shift+R.

WHAT IS NEW
  * Top menu: all categories with a drop-down (like Meesho). Make a category a CHILD of another in Admin > Categories
    (Parent category) - level 1 = menu, level 2 = bold column heading, level 3 = links under it.
  * Categories page (mobile + desktop): left list + sub-categories with pictures (like Flipkart). Add pictures in Admin > Categories > Thumbnail.
  * Product page: swipe gallery with rating chip, wishlist + share, size boxes, price with green down-arrow %, delivery details,
    return / COD chips, Similar products, Product highlights + All details (open/close), ratings summary with bars, review cards,
    Recently viewed, More products for you, fixed Add to bag / Buy now bar.
  * Product cards and home sections restyled (rating chip, price row, round arrow button).
  * ADMIN > STOREFRONT (new tab) - edit the home page without code:
      1. Top banner (desktop only): background picture, offer text, QR code picture, heading, Shop Now button + link.
      2. Category arches (round pictures): picture + name + link, order with arrows. Empty = your categories are used.
      3. Big banners: upload a PNG/JPG, then DRAG BOXES on the picture to make parts clickable (Shop Now button, each tile...).
         Each box has a name and a link. Choose where the banner shows (after arches / after brand cards / after logo strip).
      4. Brand cards row (picture + coloured label + VIEW ALL link).
      5. Brand logo strip: scrolls in an endless loop; logos come from Admin > Brands (upload a logo for each brand).
     Press "Save changes" to publish. Nothing changes on the live site before that.
  * Website LOGO / colours: Admin > Appearance (already there).
  * Links you can type: /c/category-slug , /product/product-slug , /search?q=kurti , a full https:// link, or paste a page address
    from your browser. The link box also suggests your categories.
FILES: NEW assets/js/storefront.js, storefront_admin.js, assets/css/storefront.css, database/migration_v5.sql.
       CHANGED shop.js, app.js, admin.js, icons.js, index.html, sw.js, database/setup.sql (coupon fix for new installs).
TESTED HERE with a simulated shop (fake data): home, categories, product page on phone and desktop, drop-down menu, and the admin
  Storefront editor (upload, drawing click-boxes, saving). NOT tested against your real Supabase - after the SQL, add images in
  Admin > Storefront and look at the site once.



==============================================================
  UPDATE v6: MEESHO-STYLE PRODUCT PAGE + SELLER SHOP PAGE
==============================================================
1) RUN THIS SQL ONCE: Supabase > SQL Editor > paste database/migration_v6.sql > Run.
   (shop logo/banner/link, followers, review "Helpful" votes.  Run migration_v5.sql first if you did not yet.)
2) Copy the new files over your website folder (keep your own supabase\supabase.js), press Ctrl+Shift+R.

PRODUCT PAGE (like Meesho): breadcrumb, swipe photos with dots, "N Similar Products" thumbnails, title with Wishlist + Share,
  price (onwards / MRP / % off), rating chip, Select Size, delivery PIN check, SOLD BY (shop logo, name, View Shop, rating,
  number of products), Product Highlights (+ COPY), Additional Details, More Information, Product Ratings & Reviews
  (Excellent / Very Good / Good / Average / Poor bars, reviewer name, date, review photos, Helpful (n), VIEW ALL REVIEWS),
  Secure Payments / Cash on Delivery / Returns strip, fixed bottom bar "Add to Cart" + "Buy Now", People also viewed.
  Product cards now show: title, price, % off, rating pill with number of ratings.
  Customers can add up to 3 photos when they review a delivered product.
SHOP PAGE (#/shop/<name>): banner, logo, shop name, rating + number of ratings, followers, products count, Follow button,
  Share, About text, All Products with Sort / Category / Rating / Price filters.
SELLER: Seller dashboard > Store profile > "Shop page": upload logo and banner, copy / share the shop link, "View my shop".
  A shop is visible to customers only after the admin approved the seller.



==============================================================
  UPDATE v7: LOGO FIT, SHARP CARDS, FONT UPLOAD, "SAVED BUT NOT CHANGING" FIX
==============================================================
1) RUN THIS SQL ONCE: Supabase > SQL Editor > paste database/migration_v7.sql > Run.
   (installs the latest appearance-save function with font support, allows font files in the brand-assets bucket,
    and makes the saved appearance public so every visitor sees it)
2) Copy the new files over your website folder (keep your own supabase\supabase.js), press Ctrl+Shift+R twice.

WHAT CHANGED
  * LOGO: a transparent PNG with icon + text now fits the header (up to 44 px high, 240 px wide) and the footer. The pink/coloured box
    behind transparent logos is gone. Upload in Admin > Appearance > Main website logo.
  * Appearance (logo, favicon, colours, name) is now always read fresh from the database (never from an old saved copy), and after
    "Save Changes" the website READS IT BACK to prove it was saved and is visible to visitors. If not, you get a clear message
    telling you what to run, instead of a false "saved".  Old cached data on every device is wiped once automatically.
  * PRODUCT CARDS and other boxes: corners are now only slightly rounded (4-6 px) and look sharp.
  * FONTS: Admin > Appearance > Fonts. Upload .otf / .ttf / .woff / .woff2 (up to 2 MB, up to 6 fonts), then choose where each font is used:
    whole website, headings, product titles, prices, buttons, top menu + bottom bar. "Default font" keeps the normal font.
    A live preview shows the result before you press Save Changes.
TIP: if a change still looks old, press Ctrl+Shift+R (twice). The favicon in the browser tab can take a minute to refresh.


==============================================================
  UPDATE v8: FIXED BUY BAR + "SOMEONE ELSE CHANGED THE APPEARANCE" FIX
==============================================================
  * Product page on phones: "Add to Cart" + "Buy Now" now STAY at the bottom of the screen while you scroll (like the header).
    (The page fade-in animation was breaking fixed bars; it is now opacity-only.)
  * Admin > Appearance: the message "Someone else changed the appearance settings. Reload this page and try again." no longer blocks saving.
    If that happens the website re-reads the latest version and saves once more automatically (only the fields you changed are written).
    The read-back check now ignores the order of fields. No new SQL needed (migration_v7.sql from before is still required).


==============================================================
  UPDATE v9: FIX "The database did not keep the change"
==============================================================
  RUN database/migration_v8.sql ONCE (Supabase > SQL Editor).  It repairs the stored website-look row (it had become plain text,
  so saves were merged into text and never showed) and installs the final save function.
  * Admin > Settings no longer lists the "branding" and "storefront" rows (they are JSON; editing them there as text broke them).
    Use the Appearance and Storefront tabs for those.
  * If the save function ever fails to keep a change, the website now writes the row directly and checks again. If it still cannot,
    the red message shows the exact reason in [brackets] - send that text.


==============================================================
  UPDATE v10: HIDE THE TOP CATEGORY MENU
==============================================================
  Admin > Storefront > first box "Top category menu": untick "Show the top category menu" and press Save changes.
  The coloured bar under the search box disappears on the whole website (tick it again to bring it back). No SQL needed.


==============================================================
  UPDATE v11: BACKGROUND MUSIC
==============================================================
1) RUN database/migration_v11.sql ONCE (Supabase > SQL Editor). It creates the public "site-music" storage (only admins can upload) and the music setting.
2) Admin > Music (new tab): tick "Play background music on the website", upload songs (MP3 / M4A / OGG / WAV, up to 15 MB each, up to 30),
   rename them, change the order with the arrows, choose shuffle and the starting volume, press Save changes.
HOW IT WORKS FOR VISITORS
  * Music starts by itself when they open the website. Browsers only allow sound after the first tap / click / key press, so the very first
    touch starts it (the play button pulses until then).
  * Top bar: play / pause, next song, mute, and a small arrow for song name + volume slider (on phones: play/pause + arrow).
  * It plays ONLY while the visitor is on the website: when they switch to another tab or app, lock the phone or close the page the music pauses;
    when they return it continues from the same place. Songs play one after another and repeat the list.
  * If a visitor presses pause or mute, the website remembers it and will not force music on them again.
  * Music is not played inside the Admin / Seller panels.
NOTES: use only songs you own or have a licence for. Songs are streamed from your Supabase storage, so they count towards your storage
  bandwidth - use 96-128 kbps MP3 files to keep it small.


==============================================================
  UPDATE v12: MUSIC BUTTONS NOT SHOWING ON THE WEBSITE
==============================================================
  * After leaving the Admin panel (without reloading) the music buttons were not created again. Fixed: they appear on every normal page.
  * The playlist is now always read fresh from the server (an old saved copy can no longer hide it); if the page starts late, it keeps retrying.
  CHECKLIST if you still do not see the buttons next to the heart / account icons in the top bar:
  1) Admin > Music: "Play background music on the website" ticked, at least 1 song in the list, Save changes pressed.
  2) database/migration_v11.sql was run.   3) Press Ctrl+Shift+R twice on the website.   4) Touch / click the page once to start the sound.


==============================================================
  UPDATE v13: MUSIC BUTTONS ALIGNED IN ONE LINE
==============================================================
  The music buttons (play / next / mute / arrow) now sit exactly on the same line as the logo and the heart / account / cart icons,
  on desktop, tablet and Android. (A global button margin was pushing them up.) No SQL needed.


==============================================================
  UPDATE v14: MEESHO-STYLE ORDERS + ORDER DETAILS + 2-STEP CHECKOUT  (no SQL needed)
==============================================================
  MY ORDERS: one row per product with big photo, status (Order Placed / Shipped / Delivered / Order Cancelled...), date or cancel reason,
    Size - Qty, "ADD FEEDBACK" on delivered items, Search orders box and Filters (All / On the way / Delivered / Cancelled / Returned).
  ORDER DETAILS: ORDER DETAILS bar with HELP, order number + product + size + Cash/Prepaid + "All issue easy returns", "How was the product?"
    stars (tap a star -> opens the product's review box with that rating), status with "Delivery by <date>" (estimated from the delivery PIN
    code settings), tracker Ordered -> Shipped -> Out for Delivery -> Delivery with truck and "Shipping Soon!" bubble, "N+ users rated X star"
    (real numbers), "Cancellation available till shipping!" + Cancel Order, return row for delivered items, tracking number, payment mode,
    Delivery Address, Price Details and Order updates (open / close), refunds, and Pay Now for unpaid online orders.
  CHECKOUT is now 2 steps: STEP 1/2 DELIVERY ADDRESS (address, items, delivery) -> Continue -> STEP 2/2 PAYMENT METHOD (Pay Online / Cash on
    Delivery cards, Price Details). A fixed bottom bar shows the total, VIEW PRICE DETAILS and Continue / Place Order / Pay Now.
  NOT included (needs business rules or extra data): "Save Rs 28 / Switch to UPI" prepaid discounts, "Ask friends to pay", "Pay Later",
    changing the address of a placed order, exchange.


==============================================================
  UPDATE v15: SELLER BULK UPLOAD (spreadsheet)   (no SQL needed)
==============================================================
  Seller dashboard > "Bulk upload" (also a button on the Products page).
  1) Tick the product types to list (Shirts & T-shirts, Jeans & Trousers, Kurti/Saree, Western wear, Kids wear, Footwear, Grocery & food,
     Bottles & Home & kitchen, Beauty, Electronics, Bags/jewellery/watches/accessories, Anything else) -> "Download Excel template".
     The Excel file has a "How to fill" sheet, one sheet per selected type, and a "Categories" sheet (drop-down list inside the sheet).
     Columns: Product Code, Title, Brand, Category, Description, MRP, Selling Price, GST %, Material, Colour, Returnable, size stock
     columns (Free Size / S / M / L / XL / XXL; jeans 28-38; footwear 6-11; kids age sizes) or Pack size + Stock for non-size products,
     type-specific details (Fit, Pattern, Sleeve ...), Care instructions, Image 1 / Image 2 / Image 3.
     SIZES: type the stock in each size column; leave blank if you do not sell that size.
  2) Upload the filled .xlsx (Excel, Google Sheets "Download as Excel", LibreOffice) - or a .csv for one type. Old .xls is not supported.
  3) Choose the photo files (or a whole folder). They are matched by FILE NAME with the Image 1/2/3 columns (upper/lower case ignored).
     Large photos are reduced automatically (max 1600 px) before upload.
  4) The page checks every row (required fields, category, prices, stock, missing photos) and shows what is wrong. Fix the sheet and choose
     it again - photos stay. Press "Upload N products": products are saved as drafts, or sent for review right away (your choice).
  Up to 200 products per upload. A product that fails (for example a network problem) is rolled back completely and listed with the reason.
  The yellow EXAMPLE row in the template is skipped automatically.
  New files: assets/js/bulk.js, assets/js/xlsx-lite.js, assets/vendor/jszip.min.js (JSZip, MIT licence).
