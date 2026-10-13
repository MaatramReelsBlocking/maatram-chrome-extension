const BLOCKED_DOMAINS = [
  "youtube.com",
  "instagram.com",
  "x.com",
  "facebook.com",
  "tiktok.com",
  "snapchat.com"
];

const RULE_ID_START = 1000;
const CUSTOM_RULE_START = 2000;   // your own sites: 2000, 2001, ...
const MAX_CUSTOM_SITES = 50;
const LOCK_ALARM = "maatram-hard-lock";
const NOCOOKIE_RULE_ID = RULE_ID_START + BLOCKED_DOMAINS.length;


async function createBlockingRules() {

  // A redirect needs site access. If the user sets a site to "on click" in Chrome,
  // the redirect is skipped and the site loads, so fall back to a plain block.
  const rules = await Promise.all(BLOCKED_DOMAINS.map(async (domain, index) => ({
    id: RULE_ID_START + index,
    priority: 100,
    action: (await hasSiteAccess(domain))
      ? { type: "redirect", redirect: { extensionPath: "/blocked.html" } }
      : { type: "block" },
    condition: { requestDomains: [domain], resourceTypes: ["main_frame"] }
  })));

  // youtube-nocookie.com/embed/<id> plays any YouTube video: lock it with YouTube.
  // A plain block, so no extra site access is asked for.
  if (rules.some(r => r.id === RULE_ID_START + BLOCKED_DOMAINS.indexOf("youtube.com"))) {
    rules.push({ id: NOCOOKIE_RULE_ID, priority: 100, action: { type: "block" }, condition: { requestDomains: ["youtube-nocookie.com"], resourceTypes: ["main_frame"] } });
  }

  return rules;

}


/*
 * Your own sites (added in the popup or on maatram.co.in).
 * With the user's OK for that site (asked in the popup), they get the same
 * green lock screen as YouTube; without it, a plain "block" rule.
 */

function siteOrigins(d) {
  return ["*://" + d + "/*", "*://*." + d + "/*"];
}

async function hasSiteAccess(d) {
  return chrome.permissions.contains({ origins: siteOrigins(d) }).catch(() => false);
}

function normalizeSite(value) {

  const d = String(value || "").trim().toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[\/?#:]/)[0]
    .replace(/^www\./, "");

  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return "";
  if (/(^|\.)maatram\.co\.in$/.test(d)) return "";
  if (BLOCKED_DOMAINS.includes(d)) return "";
  return d;

}


async function getCustomSites() {

  const { customSites = [] } = await chrome.storage.local.get("customSites");
  return Array.isArray(customSites) ? customSites : [];

}


async function setCustomSites(list) {

  const data = await chrome.storage.local.get(["hardLockActive", "hardLockEndTime"]);

  if (data.hardLockActive && Number(data.hardLockEndTime) > Date.now()) {
    throw new Error("You can change your sites after the lock ends.");
  }

  const clean = [...new Set((Array.isArray(list) ? list : []).map(normalizeSite).filter(Boolean))];

  if (clean.length > MAX_CUSTOM_SITES) {
    throw new Error("You can add up to " + MAX_CUSTOM_SITES + " sites.");
  }

  await chrome.storage.local.set({ customSites: clean, customSitesSet: true });
  return clean;

}


async function createCustomRules(sites) {

  return Promise.all(sites.map(async (domain, index) => ({
    id: CUSTOM_RULE_START + index,
    priority: 100,
    action: (await hasSiteAccess(domain))
      ? { type: "redirect", redirect: { extensionPath: "/blocked.html?site=" + encodeURIComponent(domain) } }
      : { type: "block" },
    condition: { requestDomains: [domain], resourceTypes: ["main_frame"] }
  })));

}


async function customRuleIds() {

  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  return rules.map(r => r.id).filter(id => id >= CUSTOM_RULE_START);

}


async function enableBlocking() {

  const rules =
    (await createBlockingRules()).concat(
      await createCustomRules(await getCustomSites())
    );

  await chrome.declarativeNetRequest.updateDynamicRules({

    removeRuleIds:
      rules.map(rule => rule.id).concat(NOCOOKIE_RULE_ID, await customRuleIds()),

    addRules:
      rules

  });

}


async function disableBlocking() {

  const ruleIds =
    BLOCKED_DOMAINS.map(
      (_, index) =>
        RULE_ID_START + index
    ).concat(NOCOOKIE_RULE_ID, await customRuleIds());

  await chrome.declarativeNetRequest.updateDynamicRules({

    removeRuleIds:
      ruleIds,

    addRules: []

  });

}


async function startHardLock(minutes) {

  if (
    !Number.isInteger(minutes) ||
    minutes < 1 ||
    minutes > 180
  ) {

    throw new Error(
      "Duration must be between 1 and 180 minutes."
    );

  }


  await lockUntil(Date.now() + minutes * 60 * 1000);

}


/* Locks until an exact time (used by the toolbar, the website and linked devices). */
async function lockUntil(endTime) {

  const cur = await chrome.storage.local.get(["hardLockActive", "hardLockEndTime", "hardLockStartTime"]);
  const running = cur.hardLockActive && Number(cur.hardLockEndTime) > Date.now();
  if (running && Number(cur.hardLockEndTime) > endTime) endTime = Number(cur.hardLockEndTime);
  // when this lock began (kept if it only extends a running one), so maatram.co.in can draw its ring
  const startTime = running && cur.hardLockStartTime ? Number(cur.hardLockStartTime) : Date.now();

  /*
   * IMPORTANT:
   * Save the timer BEFORE enabling the redirect.
   * This makes sure blocked.html can immediately
   * read the correct remaining time.
   */

  await chrome.storage.local.set({

    hardLockActive: true,

    hardLockEndTime: endTime,

    hardLockStartTime: startTime

  });


  await enableBlocking();

  // Rules only catch new page loads: reload tabs already open on a protected site.
  const open = await chrome.tabs.query({ url: BLOCKED_DOMAINS.concat(await getCustomSites()).flatMap(siteOrigins) }).catch(() => []);
  open.forEach(t => chrome.tabs.reload(t.id).catch(() => {}));


  await chrome.alarms.clear(
    LOCK_ALARM
  );


  await chrome.alarms.create(
    LOCK_ALARM,
    {
      when: endTime
    }
  );

}


async function stopHardLock() {

  await chrome.alarms.clear(
    LOCK_ALARM
  );


  await disableBlocking();


  await chrome.storage.local.set({

    hardLockActive: false,

    hardLockEndTime: null

  });

}


chrome.runtime.onMessageExternal.addListener(

  (message, sender, sendResponse) => {

    (async () => {

      try {

        if (
          sender.origin !==
          "https://maatram.co.in"
        ) {

          throw new Error(
            "Unauthorized website."
          );

        }


        if (
          message.action ===
          "START_HARD_LOCK"
        ) {

          await startHardLock(
            Number(
              message.durationMinutes
            )
          );


          sendResponse({

            success: true,

            active: true

          });


          return;

        }


        if (
          message.action ===
          "GET_STATUS"
        ) {

          const data =
            await chrome.storage.local.get([

              "hardLockActive",

              "hardLockEndTime",

              "hardLockStartTime"

            ]);


          const active =
            Boolean(
              data.hardLockActive
            ) &&

            Number(
              data.hardLockEndTime
            ) > Date.now();


          sendResponse({

            success: true,

            active: active,

            endTime:
              data.hardLockEndTime ||
              null,

            startTime:
              data.hardLockStartTime ||
              null

          });


          return;

        }


        if (message.action === "SET_CUSTOM_SITES") {

          sendResponse({ success: true, sites: await setCustomSites(message.sites) });

          return;

        }


        if (message.action === "GET_CUSTOM_SITES") {

          sendResponse({ success: true, sites: await getCustomSites() });

          return;

        }


        if (message.action === "SET_PREFERRED_MINUTES") {
          const m = Number(message.minutes);
          if (!Number.isInteger(m) || m < 1 || m > 180) throw new Error("Duration must be between 1 and 180 minutes.");
          await chrome.storage.local.set({ preferredMinutes: m });
          sendResponse({ success: true });
          return;
        }

        if (message.action === "GET_SETTINGS") {
          const d = await chrome.storage.local.get(["customSites", "customSitesSet", "preferredMinutes"]);
          sendResponse({ success: true, sites: Array.isArray(d.customSites) ? d.customSites : [], minutes: d.preferredMinutes || null, set: Boolean(d.customSitesSet) });
          return;
        }

        if (message.action === "GET_USAGE") {

          const { usage = {} } = await chrome.storage.local.get("usage");

          sendResponse({ success: true, usage });

          return;

        }

        throw new Error(
          "Unknown message action."
        );


      }

      catch (error) {

        sendResponse({

          success: false,

          error:
            error.message

        });

      }

    })();


    return true;

  }

);


chrome.alarms.onAlarm.addListener(

  async alarm => {

    if (
      alarm.name ===
      LOCK_ALARM
    ) {

      await checkLockState();

    }

  }

);


async function checkLockState() {

  const data =
    await chrome.storage.local.get([

      "hardLockActive",

      "hardLockEndTime"

    ]);


  if (
    data.hardLockActive &&
    data.hardLockEndTime
  ) {

    if (
      Number(
        data.hardLockEndTime
      ) <= Date.now()
    ) {

      // Moving the computer's clock forward must not end the lock early:
      // check the real time first and wait out what is left.
      const left = Number(data.hardLockEndTime) - await realNow();

      if (left > 5000) {
        await chrome.alarms.create(LOCK_ALARM, { delayInMinutes: left / 60000 });
        return;
      }

      await stopHardLock();

    }

    else {

      const alarm =
        await chrome.alarms.get(
          LOCK_ALARM
        );


      if (!alarm) {

        await chrome.alarms.create(

          LOCK_ALARM,

          {
            when:
              Number(
                data.hardLockEndTime
              )
          }

        );

      }

    }

  }

}


/* maatram.co.in's clock; this computer's if the site can't be reached. */
async function realNow() {
  // ponytail: offline + clock moved forward still ends the lock; needs a signed time source to close
  try {
    const r = await fetch("https://maatram.co.in/", { method: "HEAD", cache: "no-store" });
    const t = Date.parse(r.headers.get("date"));
    return Number.isNaN(t) ? Date.now() : t;
  } catch (_) {
    return Date.now();
  }
}


checkLockState();


chrome.runtime.onStartup.addListener(
  checkLockState
);

/*
 * Internal messages from the extension popup.
 * Lets a user start a Hard Lock straight from the
 * toolbar, with no Maatram account needed.
 */

chrome.runtime.onMessage.addListener(
  (message, sender, sendResponse) => {

    (async () => {

      try {

        if (message.action === "START_HARD_LOCK") {

          await startHardLock(
            Number(message.durationMinutes)
          );

          pushLink(Number(message.durationMinutes)).catch(() => {});

          sendResponse({ success: true, active: true });

          return;

        }

        if (message.action === "SET_LINK_CODE") {

          const code = String(message.code || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
          if (code && !LINK_CODE.test(code)) throw new Error("A link code is 8 letters or digits, like ABCD-2345.");
          await chrome.storage.local.set({ linkCode: code });
          if (code) await pollLink().catch(() => {});
          sendResponse({ success: true, code });

          return;

        }

        if (message.action === "SET_CUSTOM_SITES") {

          sendResponse({ success: true, sites: await setCustomSites(message.sites) });

          return;

        }

        throw new Error("Unknown message action.");

      }

      catch (error) {

        sendResponse({
          success: false,
          error: error.message
        });

      }

    })();

    return true;

  }
);


/*
 * Usage tracking for the Maatram Stats page.
 * Once a minute: if Chrome is focused, the user is not idle and the
 * active tab is one of the protected sites, add 1 minute for that site.
 * Tab URLs are only readable for the protected sites (host permissions),
 * so no other browsing is ever seen. Data stays in chrome.storage.local
 * and is only handed to maatram.co.in when the Stats page asks.
 */

const USAGE_ALARM = "maatram-usage-tick";
const KEEP_DAYS = 35;

function dayKey(date = new Date()) {
  return date.getFullYear() + "-" +
    String(date.getMonth() + 1).padStart(2, "0") + "-" +
    String(date.getDate()).padStart(2, "0");
}

function siteOf(url) {
  try {
    const host = new URL(url).hostname;
    return BLOCKED_DOMAINS.find(d => host === d || host.endsWith("." + d)) || null;
  } catch (_) {
    return null;
  }
}

async function tickUsage() {
  const idle = await chrome.idle.queryState(60);
  if (idle === "locked") return;

  const win = await chrome.windows.getLastFocused().catch(() => null);
  if (!win || !win.focused) return;

  const [tab] = await chrome.tabs.query({ active: true, windowId: win.id });
  const site = tab && tab.url && siteOf(tab.url);
  if (!site || (idle === "idle" && !tab.audible)) return;   // a playing video counts, a forgotten tab does not

  const { usage = {} } = await chrome.storage.local.get("usage");
  const day = dayKey();
  usage[day] = usage[day] || {};
  usage[day][site] = (usage[day][site] || 0) + 1;

  const cutoff = dayKey(new Date(Date.now() - KEEP_DAYS * 864e5));
  for (const k of Object.keys(usage)) if (k < cutoff) delete usage[k];

  await chrome.storage.local.set({ usage });
}

chrome.alarms.get(USAGE_ALARM).then(a => a || chrome.alarms.create(USAGE_ALARM, { periodInMinutes: 1 }));

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === USAGE_ALARM) tickUsage().catch(console.error);
});

/*
 * Linked devices: one Hard Lock for maatram.co.in, the Maatram Hard Lock phone app and this
 * extension. They share a link code; a lock started on any of them is stored under the code
 * at maatram.co.in/api/link, and this extension checks it once a minute and locks too.
 */

const LINK_ALARM = "maatram-link-check";
const LINK_CODE = /^[A-HJ-NP-Z2-9]{8}$/;
const LINK_API = "https://maatram.co.in/api/link";

async function pollLink() {
  const { linkCode, hardLockEndTime } = await chrome.storage.local.get(["linkCode", "hardLockEndTime"]);
  if (!LINK_CODE.test(linkCode || "")) return;
  const r = await fetch(LINK_API + "?code=" + linkCode, { cache: "no-store" });
  if (!r.ok) return;
  const d = await r.json();
  const end = d.end + (Date.now() - d.now);        // correct for this computer's clock
  if (d.end > d.now + 3000 && end > Number(hardLockEndTime || 0) + 5000) await lockUntil(end);
}

async function pushLink(minutes) {
  const { linkCode } = await chrome.storage.local.get("linkCode");
  if (!LINK_CODE.test(linkCode || "")) return;
  await fetch(LINK_API, {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: linkCode, minutes, by: "chrome" })
  });
}

chrome.alarms.get(LINK_ALARM).then(a => a || chrome.alarms.create(LINK_ALARM, { periodInMinutes: 1 }));

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === LINK_ALARM) pollLink().catch(() => {});
});

chrome.runtime.onStartup.addListener(() => pollLink().catch(() => {}));

/* Site access granted mid-lock: switch that site from the plain block to the lock screen. */
chrome.permissions.onAdded.addListener(async () => {
  const data = await chrome.storage.local.get(["hardLockActive", "hardLockEndTime"]);
  if (data.hardLockActive && Number(data.hardLockEndTime) > Date.now()) await enableBlocking();
});

/* Site access taken away mid-lock: a redirect rule with no access lets the site through, so fall back to a plain block. */
chrome.permissions.onRemoved.addListener(async () => {
  const data = await chrome.storage.local.get(["hardLockActive", "hardLockEndTime"]);
  if (data.hardLockActive && Number(data.hardLockEndTime) > Date.now()) await enableBlocking();
});

/*
 * Rules only see requests that reach the network. Back/forward cache and a site's own
 * service worker can show a page with no request, so also catch the tab itself.
 */
chrome.tabs.onUpdated.addListener(async (tabId, info) => {
  if (!info.url || !/^https?:/.test(info.url)) return;
  const host = new URL(info.url).hostname;
  const rules = await chrome.declarativeNetRequest.getDynamicRules();
  const rule = rules.find(r => (r.condition.requestDomains || []).some(d => host === d || host.endsWith("." + d)));
  // tab URLs are only visible on sites with access, which always have the redirect rule
  if (rule && rule.action.type === "redirect") chrome.tabs.update(tabId, { url: chrome.runtime.getURL(rule.action.redirect.extensionPath) }).catch(() => {});
});
