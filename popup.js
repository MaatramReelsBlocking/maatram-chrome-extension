const statusElement =
  document.getElementById(
    "statusText"
  );

const descriptionElement =
  document.getElementById(
    "statusDescription"
  );

const timerElement =
  document.getElementById(
    "timer"
  );

const badgeElement =
  document.getElementById(
    "lockBadge"
  );

const iconElement =
  document.getElementById(
    "statusIcon"
  );


const lockControlElement =
  document.getElementById(
    "lockControl"
  );

const minutesElement =
  document.getElementById(
    "lockMinutes"
  );

const startButtonElement =
  document.getElementById(
    "startLock"
  );

const errorElement =
  document.getElementById(
    "lockError"
  );


let timerInterval = null;


function formatTime(milliseconds) {

  const totalSeconds =
    Math.max(
      0,
      Math.ceil(
        milliseconds / 1000
      )
    );


  const hours =
    Math.floor(
      totalSeconds / 3600
    );


  const minutes =
    Math.floor(
      (totalSeconds % 3600) / 60
    );


  const seconds =
    totalSeconds % 60;


  return [

    hours,
    minutes,
    seconds

  ]

    .map(
      value =>
        String(value)
          .padStart(2, "0")
    )

    .join(":");
}


function showActive(endTime) {

  statusElement.textContent =
    "Hard Lock is ACTIVE";


  descriptionElement.textContent =
    "Your protected sites are locked";


  iconElement.textContent =
    "🔒";


  badgeElement.textContent =
    "LOCKED";


  badgeElement.classList.remove(
    "off"
  );


  badgeElement.classList.add(
    "active"
  );


  lockControlElement.hidden = true;

  clearInterval(timerInterval);


  function updateTimer() {

    const remaining =
      endTime -
      Date.now();


    if (
      remaining <= 0
    ) {

      clearInterval(
        timerInterval
      );


      showInactive();

      return;
    }


    timerElement.textContent =
      formatTime(
        remaining
      );

  }


  updateTimer();


  timerInterval =
    setInterval(
      updateTimer,
      1000
    );

}


function showInactive() {

  clearInterval(
    timerInterval
  );


  statusElement.textContent =
    "Hard Lock is OFF";


  descriptionElement.textContent =
    "Pick a duration below to start blocking";


  lockControlElement.hidden = false;


  timerElement.textContent =
    "00:00:00";


  iconElement.textContent =
    "🔓";


  badgeElement.textContent =
    "UNLOCKED";


  badgeElement.classList.remove(
    "active"
  );


  badgeElement.classList.add(
    "off"
  );

}


async function loadStatus() {

  try {

    const data =
      await chrome.storage.local.get([

        "hardLockActive",

        "hardLockEndTime"

      ]);


    if (

      data.hardLockActive &&

      data.hardLockEndTime &&

      data.hardLockEndTime >
        Date.now()

    ) {

      showActive(
        data.hardLockEndTime
      );

    }

    else {

      showInactive();

    }

  }

  catch (error) {

    console.error(
      error
    );

    showInactive();

  }

}


startButtonElement.addEventListener(
  "click",
  async () => {

    errorElement.textContent = "";

    startButtonElement.disabled = true;


    try {

      const response =
        await chrome.runtime.sendMessage({

          action: "START_HARD_LOCK",

          durationMinutes:
            Number(minutesElement.value)

        });


      if (!response || !response.success) {

        throw new Error(
          (response && response.error) ||
          "Could not start Hard Lock."
        );

      }


      await loadStatus();

    }

    catch (error) {

      errorElement.textContent =
        error.message;

    }

    finally {

      startButtonElement.disabled = false;

    }

  }
);


loadStatus();

/* today's minutes per protected site, counted by background.js */
chrome.storage.local.get("usage").then(({ usage = {} }) => {
  const d = new Date();
  const day = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const today = usage[day] || {};
  document.querySelectorAll(".site[data-site]").forEach(el => {
    const m = today[el.dataset.site] || 0;
    if (m) el.firstElementChild.textContent += " · " + (m >= 60 ? Math.floor(m / 60) + "h " + (m % 60) + "m" : m + "m");
  });
});


/* Your own sites: added here or on maatram.co.in, blocked during every Hard Lock. */
const siteForm = document.getElementById("siteForm");
const siteInput = document.getElementById("siteInput");
const siteError = document.getElementById("siteError");
const siteList = document.getElementById("siteList");

async function saveSites(list) {
  siteError.textContent = "";
  const response = await chrome.runtime.sendMessage({ action: "SET_CUSTOM_SITES", sites: list });
  if (!response || !response.success) {
    siteError.textContent = (response && response.error) || "Could not save your sites.";
  }
  renderSites();
}

async function renderSites() {
  const data = await chrome.storage.local.get(["customSites", "hardLockActive", "hardLockEndTime"]);
  const sites = Array.isArray(data.customSites) ? data.customSites : [];
  const locked = Boolean(data.hardLockActive) && Number(data.hardLockEndTime) > Date.now();
  siteForm.parentElement.classList.toggle("locked", locked);
  siteList.textContent = sites.length ? "" : (locked ? "" : "Add any site you want locked too.");
  sites.forEach(site => {
    const chip = document.createElement("span");
    chip.className = "site-chip";
    chip.textContent = site;
    const remove = document.createElement("button");
    remove.type = "button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", "Remove " + site);
    remove.addEventListener("click", () => saveSites(sites.filter(s => s !== site)));
    chip.appendChild(remove);
    siteList.appendChild(chip);
  });
}

siteForm.addEventListener("submit", async event => {
  event.preventDefault();
  const value = siteInput.value.trim();
  if (!value) return;
  const { customSites = [] } = await chrome.storage.local.get("customSites");
  siteInput.value = "";
  await saveSites(customSites.concat(value));
  const after = (await chrome.storage.local.get("customSites")).customSites || [];
  if (!siteError.textContent && after.length === customSites.length) {
    siteError.textContent = "Use a site address like netflix.com (Instagram, YouTube and the rest are already blocked).";
  }
});

renderSites();

/* Linked devices: the code from maatram.co.in. A lock on any linked device locks this computer too. */
const linkForm = document.getElementById("linkForm");
const linkInput = document.getElementById("linkInput");
const linkError = document.getElementById("linkError");
const linkStatus = document.getElementById("linkStatus");

async function renderLink() {
  const { linkCode } = await chrome.storage.local.get("linkCode");
  if (linkCode) {
    linkInput.value = linkCode.slice(0, 4) + "-" + linkCode.slice(4);
    linkStatus.textContent = "Linked. A Hard Lock on the website or your phone locks this computer within a minute, and a lock you start here locks them too.";
  }
}

linkForm.addEventListener("submit", async e => {
  e.preventDefault();
  linkError.textContent = "";
  const response = await chrome.runtime.sendMessage({ action: "SET_LINK_CODE", code: linkInput.value });
  if (!response || !response.success) linkError.textContent = (response && response.error) || "Could not save the code.";
  else if (!response.code) linkStatus.textContent = "Not linked.";
  renderLink();
  loadStatus();
  renderSites();
});

renderLink();

/* a lock started on the website or a linked device while the popup is open */
chrome.storage.onChanged.addListener(() => { loadStatus(); renderSites(); });
